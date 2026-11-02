import type { DatabaseSync } from 'node:sqlite';
import { decideModeration } from '../../core/moderation.ts';
import type { ChatObservation } from '../../core/moderation.ts';

interface Dependencies {
  classify: (message: string) => Promise<ChatObservation>;
  remove: (id: string) => Promise<unknown>;
  notify: (id: string) => Promise<unknown>;
}
export class ChatGuard {
  private policy: { autoDelete: boolean };
  private db: DatabaseSync;
  private dependencies: Dependencies;
  private busy = 0;
  private status = 'idle';
  constructor(db: DatabaseSync, dependencies: Dependencies, policy = { autoDelete: false }) {
    this.policy = policy;
    this.db = db;
    this.dependencies = dependencies;
    db.exec(
      'CREATE TABLE IF NOT EXISTS moderation_audit (id TEXT PRIMARY KEY, at INTEGER NOT NULL, action TEXT NOT NULL, simulated INTEGER NOT NULL DEFAULT 0)',
    );
  }
  async check(id: string, message: string, at: number): Promise<void> {
    if (this.busy >= 3 || !id) return;
    this.busy++;
    try {
      let observation: ChatObservation | null = null;
      try {
        observation = await this.dependencies.classify(message);
        this.status = 'available';
      } catch {
        this.status = 'analysis unavailable';
      }
      const action = decideModeration(observation, this.policy);
      if (action === 'none') return;
      if (this.db.prepare('SELECT id FROM moderation_audit WHERE id=?').get(id)) return;
      // Commit the intent first; missing audit storage must prevent unlogged deletion.
      this.db
        .prepare('INSERT INTO moderation_audit (id,at,action) VALUES (?,?,?)')
        .run(id, at, action === 'delete' ? 'pending' : 'flag');
      if (action === 'delete') {
        try {
          await this.dependencies.remove(id);
          this.db.prepare('UPDATE moderation_audit SET action=? WHERE id=?').run('delete', id);
        } catch {
          this.db
            .prepare('UPDATE moderation_audit SET action=? WHERE id=?')
            .run('delete unavailable', id);
          return;
        }
      }
      await this.dependencies.notify(id).catch(() => {
        this.status = 'mod notice unavailable';
      });
    } finally {
      this.busy--;
    }
  }
  snapshot() {
    const entries = this.db
      .prepare('SELECT id,at,action FROM moderation_audit ORDER BY at DESC LIMIT 100')
      .all() as { id: string; at: number; action: string }[];
    return {
      status: this.status,
      entries: entries.map((entry) => ({ ...entry, simulated: false as const })),
    };
  }
}
