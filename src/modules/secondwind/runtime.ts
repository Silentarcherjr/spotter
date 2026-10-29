import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { calibrate, scoreEnergy, validAudio } from '../../core/energy.ts';
import type { Baseline } from '../../core/energy.ts';
import type { AudioFeatures } from '../../core/types.ts';
import { chatVelocity, correlation } from '../../core/chat.ts';
import type { ChatActivity } from '../../core/chat.ts';
import { initialRally, advanceRally, sessionReport } from '../../core/session.ts';
import type { CurvePoint } from '../../core/session.ts';

export function parseNumericFeatures(value: unknown, now: number): AudioFeatures {
  if (!value || typeof value !== 'object' || Object.keys(value).toSorted().join() !== 'at,pauseLength,pitchMedian,pitchRange,rms,spectralSlope,speechRate,voicedRatio') throw new Error('Only numeric features are accepted');
  const sample = value as AudioFeatures;
  if (!validAudio(sample) || Object.values(sample).some((item) => typeof item !== 'number') || Math.abs(sample.at - now) > 5_000 || sample.pitchMedian > 2000 || sample.pitchRange > 2000 || Math.abs(sample.spectralSlope) > 200 || sample.speechRate > 20 || sample.pauseLength > 3600) throw new Error('Invalid numeric features');
  return { ...sample, at: now };
}
export class SecondWind {
  private db: DatabaseSync;
  private session = randomUUID();
  private baseline: Baseline | null = null;
  private audio: AudioFeatures[] = [];
  private chats: ChatActivity[] = [];
  private rally = initialRally();
  private lastPoint: number | null = null;
  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS session_points (session TEXT NOT NULL,at INTEGER NOT NULL,energy REAL NOT NULL,chat REAL NOT NULL,PRIMARY KEY(session,at))');
    const saved = db.prepare("SELECT value FROM settings WHERE key='audio_baseline'").get() as { value: string } | undefined;
    if (saved) {
      try {
        const baseline = JSON.parse(saved.value) as Baseline;
        if (scoreEnergy([{ at: 0, rms: .2, pitchMedian: 150, pitchRange: 50, spectralSlope: -2, voicedRatio: .7, pauseLength: .2, speechRate: 3 }], baseline, 0) !== null) this.baseline = baseline;
      } catch { /* A malformed profile requires fresh calibration. */ }
    }
  }
  receive(sample: AudioFeatures): void {
    if (!validAudio(sample)) return;
    this.audio = [...this.audio.filter((previous) => sample.at - previous.at <= 600_000), sample].slice(-605);
    if (!this.baseline) {
      this.baseline = calibrate(this.audio, sample.at).baseline;
      if (this.baseline) this.db.prepare("INSERT INTO settings(key,value) VALUES('audio_baseline',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(this.baseline));
    }
    const energy = scoreEnergy(this.audio, this.baseline, sample.at);
    if (energy !== null && (this.lastPoint === null || sample.at - this.lastPoint >= 30_000)) {
      this.db.prepare('INSERT OR IGNORE INTO session_points(session,at,energy,chat) VALUES(?,?,?,?)').run(this.session, sample.at, energy, chatVelocity(this.chats, sample.at).messagesPerMinute);
      this.lastPoint = sample.at;
    }
  }
  chat(id: string, at: number, userId = id): void {
    this.chats = [...this.chats.filter((previous) => at - previous.at <= 60_000), { id, userId, at }].slice(-10_000);
    this.rally = advanceRally(this.rally, id, at);
  }
  resetCalibration(): void { this.baseline = null; this.audio = []; this.db.prepare("DELETE FROM settings WHERE key='audio_baseline'").run(); }
  snapshot(now: number) {
    const latest = this.audio.at(-1)?.at;
    const fresh = latest !== undefined && now >= latest && now - latest <= 5_000;
    const curves = (this.db.prepare('SELECT at,energy,chat FROM session_points WHERE session=? ORDER BY at DESC LIMIT 120').all(this.session) as unknown as CurvePoint[]).reverse();
    return {
      simulated: false as const, energy: fresh ? scoreEnergy(this.audio, this.baseline, now) : null,
      calibration: this.baseline ? 1 : calibrate(this.audio, now).progress,
      calibrated: !!this.baseline, sensorStatus: fresh ? 'available' : 'sensor unavailable',
      rally: { meter: this.rally.meter, celebrating: now < this.rally.celebratingUntil }, curves, correlation: correlation(curves),
    };
  }
  report() { return sessionReport(this.db.prepare('SELECT at,energy,chat FROM session_points WHERE session=? ORDER BY at').all(this.session) as unknown as CurvePoint[]); }
}
