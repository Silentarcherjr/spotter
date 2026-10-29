import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const scopes = ['user:read:chat', 'user:write:chat', 'moderator:manage:blocked_terms', 'moderator:manage:chat_messages', 'channel:manage:raids', 'channel:manage:broadcast'] as const;
export interface TwitchConfig { clientId: string; clientSecret: string; redirectUri: string; fetcher?: typeof fetch }
interface Identity { userId: string; scopes: string[] }
interface Tokens { access: string; refresh: string; expiresAt: number; identity: Identity }
export class TwitchAuth {
  private db: DatabaseSync;
  private config: TwitchConfig;
  private fetcher: typeof fetch;
  private pending = new Map<string, number>();
  private tokens: Tokens | null = null;
  private refreshing: Promise<void> | null = null;
  constructor(db: DatabaseSync, config: TwitchConfig) {
    this.db = db; this.config = config; this.fetcher = config.fetcher ?? fetch;
    db.exec('CREATE TABLE IF NOT EXISTS twitch_tokens (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
    const saved = db.prepare('SELECT value FROM twitch_tokens WHERE id=1').get() as { value: string } | undefined;
    if (saved) { try { this.tokens = JSON.parse(saved.value) as Tokens; } catch { this.clear(); } }
  }
  get identity(): Identity | null { return this.tokens ? structuredClone(this.tokens.identity) : null; }
  authorizeUrl(now = Date.now()): string {
    for (const [state, expiresAt] of this.pending) if (expiresAt < now) this.pending.delete(state);
    if (this.pending.size >= 10) this.pending.clear();
    const state = randomBytes(32).toString('hex');
    this.pending.set(state, now + 600_000);
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: this.config.redirectUri, response_type: 'code', force_verify: 'true', scope: scopes.join(' '), state }).toString();
    return url.toString();
  }
  async exchange(code: string, state: string, now = Date.now()): Promise<void> {
    const expiresAt = this.pending.get(state);
    this.pending.delete(state);
    if (!code || !expiresAt || expiresAt < now) throw new Error('Invalid or expired OAuth state');
    const data = await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: this.config.redirectUri });
    const identity = await this.validateAccess(data.access_token);
    this.save({ access: data.access_token, refresh: data.refresh_token, expiresAt: now + data.expires_in * 1000, identity });
  }
  private async tokenRequest(parameters: Record<string, string>): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const response = await this.fetcher('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, ...parameters }).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Twitch authentication unavailable (${response.status})`);
    const value = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
    if (!value.access_token || !value.refresh_token || !Number.isFinite(value.expires_in) || value.expires_in <= 0) throw new Error('Invalid Twitch token response');
    return value;
  }
  private async validateAccess(access: string): Promise<Identity> {
    const response = await this.fetcher('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${access}` }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Twitch validation unavailable (${response.status})`);
    const value = await response.json() as { client_id: string; user_id: string; scopes: string[] };
    if (value.client_id !== this.config.clientId || !value.user_id || !Array.isArray(value.scopes)) throw new Error('Twitch identity mismatch');
    return { userId: value.user_id, scopes: value.scopes };
  }
  async validate(): Promise<void> {
    if (!this.tokens) return;
    try { this.tokens.identity = await this.validateAccess(await this.accessToken()); this.save(this.tokens); }
    catch { await this.refresh(); }
  }
  async accessToken(): Promise<string> {
    if (!this.tokens) throw new Error('Twitch authorization required');
    if (this.tokens.expiresAt < Date.now() + 60_000) await this.refresh();
    return this.tokens!.access;
  }
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      if (!this.tokens) throw new Error('Twitch authorization required');
      const previous = this.tokens;
      const data = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: previous.refresh });
      const identity = await this.validateAccess(data.access_token);
      if (identity.userId !== previous.identity.userId) throw new Error('Twitch identity mismatch');
      this.save({ access: data.access_token, refresh: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000, identity });
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  clear(): void { this.tokens = null; this.db.prepare('DELETE FROM twitch_tokens').run(); }
  private save(tokens: Tokens): void {
    this.tokens = tokens;
    this.db.prepare('INSERT INTO twitch_tokens (id,value) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(tokens));
  }
}
