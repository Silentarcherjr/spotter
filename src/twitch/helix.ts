export class Helix {
  private clientId: string;
  private accessToken: () => Promise<string>;
  private fetcher: typeof fetch;
  constructor(clientId: string, accessToken: () => Promise<string>, fetcher: typeof fetch = fetch) {
    this.clientId = clientId; this.accessToken = accessToken; this.fetcher = fetcher;
  }
  async request<T = { data: unknown[] }>(method: string, path: string, query: Record<string, string> = {}, body?: unknown): Promise<T> {
    const url = new URL(`https://api.twitch.tv/helix/${path}`);
    url.search = new URLSearchParams(query).toString();
    const response = await this.fetcher(url, {
      method, headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Client-Id': this.clientId, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      let reason: string | null = null;
      if (path === 'raids') {
        try {
          const value = await response.json() as { message?: unknown };
          if (typeof value.message === 'string') {
            if (/settings|not accept|blocked/i.test(value.message)) reason = 'raid_target_restrictions';
            else if (/already.*raid|another.*raid/i.test(value.message)) reason = 'raid_already_pending';
            else if (/too many viewers/i.test(value.message)) reason = 'raid_size_limit';
          }
        } catch { /* Never retain arbitrary provider content. */ }
      }
      throw Object.assign(new Error(`Twitch request unavailable (${response.status})`), { reason });
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }
  users(id: string) { return this.request<{ data: { id: string; login: string; display_name: string; created_at?: string }[] }>('GET', 'users', { id }); }
  streams(userId: string) { return this.request<{ data: { user_id: string; type: string }[] }>('GET', 'streams', { user_id: userId }); }
  sendChat(broadcasterId: string, senderId: string, message: string) { return this.request('POST', 'chat/messages', {}, { broadcaster_id: broadcasterId, sender_id: senderId, message }); }
  marker(userId: string) { return this.request('POST', 'streams/markers', {}, { user_id: userId, description: 'Spotter privacy alert' }); }
  addBlockedTerm(broadcasterId: string, moderatorId: string, term: string) { return this.request('POST', 'moderation/blocked_terms', { broadcaster_id: broadcasterId, moderator_id: moderatorId }, { text: term }); }
  removeBlockedTerm(broadcasterId: string, moderatorId: string, id: string) { return this.request('DELETE', 'moderation/blocked_terms', { broadcaster_id: broadcasterId, moderator_id: moderatorId, id }); }
  deleteMessage(broadcasterId: string, moderatorId: string, messageId: string) {
    if (!messageId.trim()) throw new Error('A message ID is required; clear-all is disabled');
    return this.request('DELETE', 'moderation/chat', { broadcaster_id: broadcasterId, moderator_id: moderatorId, message_id: messageId });
  }
  startRaid(from: string, to: string) { return this.request('POST', 'raids', { from_broadcaster_id: from, to_broadcaster_id: to }); }
  cancelRaid(broadcasterId: string) { return this.request('DELETE', 'raids', { broadcaster_id: broadcasterId }); }
  subscribe(session: string, subscription: { type: string; version: string; condition: Record<string, string> }) {
    return this.request('POST', 'eventsub/subscriptions', {}, { ...subscription, transport: { method: 'websocket', session_id: session } });
  }
}
