import type { DatabaseSync } from 'node:sqlite';
import { initialTagOut, transitionTagOut } from '../../core/tagout.ts';
import type { TagOutContext, TagOutState, Partner } from '../../core/tagout.ts';

interface Identity { broadcasterId: string; tokenOwnerId: string; sourceLive: boolean }
interface Dependencies { identity: () => Identity | null; live: (id: string) => Promise<boolean>; start: (from: string, to: string) => Promise<unknown>; cancel: (id: string) => Promise<unknown>; knownIds?: readonly string[] }
export class TagOut {
  private db: DatabaseSync;
  private dependencies: Dependencies;
  private state = initialTagOut();
  private crew: Partner[] = [];
  private busy = false;
  private status = 'idle';
  private owner: string | null = null;
  private countdownUntil: number | null = null;
  constructor(db: DatabaseSync, dependencies: Dependencies) {
    this.db = db; this.dependencies = dependencies;
    db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS raid_attempts (broadcaster_id TEXT NOT NULL,at INTEGER NOT NULL,kind TEXT NOT NULL)');
  }
  private context(now: number): TagOutContext {
    const identity = this.dependencies.identity();
    const broadcasterId = identity?.broadcasterId ?? '';
    if (broadcasterId !== this.owner) {
      this.owner = broadcasterId; this.state = initialTagOut(); this.countdownUntil = null;
      const saved = this.db.prepare('SELECT value FROM settings WHERE key=?').get(`relay_state:${broadcasterId}`) as { value: string } | undefined;
      if (saved) {
        try {
          const value = JSON.parse(saved.value) as { state: TagOutState; countdownUntil: number | null };
          if (['idle', 'suggested', 'confirming', 'raiding', 'covered', 'tag-back', 'home'].includes(value.state.phase) && [value.state.homeId, value.state.partnerId].includes(broadcasterId)) {
            this.state = { ...value.state, cancelPending: false };
            this.countdownUntil = typeof value.countdownUntil === 'number' ? value.countdownUntil : null;
          }
        } catch { /* Invalid local state starts idle and cannot authorize an action. */ }
      }
      this.status = this.state.phase;
    }
    const attempts = this.db.prepare('SELECT at FROM raid_attempts WHERE broadcaster_id=? AND at>?').all(broadcasterId, now - 600_000) as { at: number }[];
    return { now, broadcasterId, tokenOwnerId: identity?.tokenOwnerId ?? '', sourceLive: identity?.sourceLive ?? false, crew: [...this.crew, ...(this.dependencies.knownIds ?? []).filter((id) => !this.crew.some((peer) => peer.id === id)).map((id) => ({ id, live: false, energy: 0 }))], recentRaids: attempts.map((attempt) => attempt.at) };
  }
  private save(): void {
    if (!this.owner) return;
    this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`relay_state:${this.owner}`, JSON.stringify({ state: this.state, countdownUntil: this.countdownUntil }));
  }
  update(energy: number | null, crew: readonly Partner[], now: number): void {
    if (this.busy) return;
    this.crew = crew.map((partner) => ({ ...partner }));
    const context = this.context(now);
    this.state = transitionTagOut(this.state, { type: 'energy', score: energy }, context).state; this.save();
  }
  async approve(now: number): Promise<void> {
    if (this.busy || !['suggested', 'tag-back'].includes(this.state.phase)) return;
    this.busy = true;
    try {
      const context = this.context(now);
      const target = this.state.phase === 'tag-back' ? this.state.homeId : this.state.partnerId;
      if (!target || !context.broadcasterId) return;
      const [sourceLive, targetLive] = await Promise.all([this.dependencies.live(context.broadcasterId), this.dependencies.live(target)]);
      const fresh = { ...context, sourceLive, crew: this.crew.map((partner) => partner.id === target ? { ...partner, live: targetLive } : partner) };
      const result = transitionTagOut(this.state, { type: 'approve' }, fresh);
      this.state = result.state;
      if (!result.actions.length) this.status = 'Raid unavailable: check live channels, energy, token ownership and rate limit';
      for (const action of result.actions) {
        if (action.type !== 'start_raid') continue;
        this.db.prepare('INSERT INTO raid_attempts(broadcaster_id,at,kind) VALUES(?,?,?)').run(context.broadcasterId, now, 'start');
        try {
          await this.dependencies.start(context.broadcasterId, action.targetId);
          this.state = transitionTagOut(this.state, { type: 'raid_started' }, fresh).state;
          this.countdownUntil = now + 90_000; this.status = 'Waiting for Twitch raid confirmation';
        } catch { this.status = 'Raid response unavailable; verify Twitch or cancel'; }
      }
    } catch { this.status = 'Live status unavailable; no raid requested'; }
    finally { this.busy = false; this.save(); }
  }
  requestBack(now: number): void { const context = this.context(now); if (!this.busy && this.state.partnerId === context.broadcasterId) this.state = transitionTagOut(this.state, { type: 'request_back' }, context).state; this.save(); }
  async cancel(now: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const context = this.context(now);
      const result = transitionTagOut(this.state, { type: 'cancel' }, context);
      this.state = result.state;
      for (const action of result.actions) if (action.type === 'cancel_raid') {
        try {
          this.db.prepare('INSERT INTO raid_attempts(broadcaster_id,at,kind) VALUES(?,?,?)').run(context.broadcasterId, now, 'cancel');
          await this.dependencies.cancel(context.broadcasterId);
          this.state = transitionTagOut(this.state, { type: 'raid_cancelled' }, context).state;
          this.countdownUntil = null; this.status = 'Cancelled';
        } catch { this.state = transitionTagOut(this.state, { type: 'cancel_failed' }, context).state; this.status = 'Cancellation unavailable; retry'; }
      }
    } finally { this.busy = false; this.save(); }
  }
  confirm(fromId: string, toId: string, now: number): void {
    const context = this.context(now);
    this.state = transitionTagOut(this.state, { type: 'raid_confirmed', fromId, toId }, context).state;
    if (this.state.phase === 'covered' || this.state.phase === 'home') { this.countdownUntil = null; this.status = this.state.phase; }
    this.save();
  }
  snapshot(now: number) {
    const context = this.context(now);
    return {
      crew: this.crew.map((partner) => ({ ...partner })), tagout: structuredClone(this.state), status: this.status,
      countdownSeconds: this.countdownUntil === null ? null : Math.max(0, Math.ceil((this.countdownUntil - now) / 1000)),
      coveringFor: this.state.partnerId === context.broadcasterId && ['covered', 'tag-back'].includes(this.state.phase) ? this.state.homeId : null,
      canApprove: this.state.phase === 'suggested' ? this.state.homeId === context.broadcasterId : this.state.phase === 'tag-back' && this.state.partnerId === context.broadcasterId,
    };
  }
}
