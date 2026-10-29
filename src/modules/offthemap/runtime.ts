import { decideExposure, dismissExposure, initialExposure, scoreFindability } from '../../core/exposure.ts';
import type { Clue, FrameObservation } from '../../core/types.ts';
import { clueDescriptions } from '../../ai/vision-contract.ts';

interface Dependencies { available?: () => boolean; capture: () => Promise<string>; analyze: (frame: string) => Promise<Clue[]>; privacy: () => Promise<void>; restore: () => Promise<void>; marker: () => Promise<unknown> }
export class OffTheMap {
  private dependencies: Dependencies;
  private thresholds: { warn: number; act: number };
  private exposure = initialExposure();
  private frames: FrameObservation[] = [];
  private busy = false;
  private dismissing = false;
  private privacyPending: Promise<void> | null = null;
  private revision = 0;
  private privacyActive = false;
  private actionStatus = 'idle';
  private markerStatus: 'idle' | 'created' | 'unavailable' = 'idle';
  private markerHttpStatus: number | null = null;
  private lastMarker: { id: string; positionSeconds: number; createdAt: string } | null = null;
  private timeline: { at: number; score: number; actions: string[]; simulated: false }[] = [];
  constructor(dependencies: Dependencies, thresholds = { warn: 60, act: 80 }) { this.dependencies = dependencies; this.thresholds = thresholds; decideExposure(this.exposure, 0, thresholds); }
  async sample(now: number): Promise<void> {
    if (this.busy || this.dismissing) return;
    this.busy = true;
    const revision = this.revision;
    try {
      let clues: Clue[];
      try { clues = await this.dependencies.analyze(await this.dependencies.capture()); }
      catch { this.exposure = decideExposure(this.exposure, null, this.thresholds).state; return; }
      if (revision !== this.revision || this.dependencies.available?.() === false) { this.exposure = decideExposure(this.exposure, null, this.thresholds).state; return; }
      const decision = decideExposure(this.exposure, scoreFindability(clues, this.frames, now), this.thresholds);
      this.exposure = decision.state;
      this.frames = [...this.frames.filter((frame) => now - frame.at <= 120_000), { at: now, clues }];
      this.timeline = [...this.timeline, { at: now, score: this.exposure.score, actions: decision.actions, simulated: false as const }].slice(-120);
      for (const action of decision.actions) {
        if (revision !== this.revision) return;
        if (this.dependencies.available?.() === false) { this.invalidateAnalysis(); return; }
        try {
          if (action === 'privacy') {
            const pending = this.dependencies.privacy(); this.privacyPending = pending;
            try { await pending; this.privacyActive = true; this.actionStatus = 'privacy applied'; }
            finally { if (this.privacyPending === pending) this.privacyPending = null; }
          }
          if (action === 'marker') {
            const response = await this.dependencies.marker() as { data?: { id?: unknown; position_seconds?: unknown; created_at?: unknown }[] } | undefined;
            this.markerStatus = 'created'; this.markerHttpStatus = null;
            const marker = response?.data?.[0];
            if (marker && (typeof marker.id === 'string' || typeof marker.id === 'number') && /^[A-Za-z0-9_-]{1,128}$/.test(String(marker.id)) && typeof marker.position_seconds === 'number' && Number.isFinite(marker.position_seconds) && typeof marker.created_at === 'string' && Number.isFinite(Date.parse(marker.created_at))) this.lastMarker = { id: String(marker.id), positionSeconds: marker.position_seconds, createdAt: marker.created_at };
          }
        } catch (error) {
          this.actionStatus = 'action unavailable';
          if (action === 'marker') { this.markerStatus = 'unavailable'; const code = error instanceof Error ? /^Twitch request unavailable \((\d{3})\)$/.exec(error.message) : null; this.markerHttpStatus = code ? Number(code[1]) : null; }
        }
      }
    } finally { this.busy = false; }
  }
  invalidateAnalysis(): void { this.revision++; this.exposure = decideExposure(this.exposure, null, this.thresholds).state; }
  async dismiss(): Promise<void> {
    if (this.dismissing) throw new Error('Restore already in progress');
    this.dismissing = true;
    this.invalidateAnalysis();
    try {
      // Ignore pending vision; let an already-sent scene change settle before reversing it.
      await this.privacyPending?.catch(() => {});
      await this.dependencies.restore();
      this.exposure = dismissExposure(this.exposure); this.privacyActive = false; this.actionStatus = 'dismissed';
    } finally { this.dismissing = false; }
  }
  snapshot() {
    return structuredClone({ simulated: false as const, analysis: this.exposure.analysis, exposure: this.exposure, privacyActive: this.privacyActive, actionStatus: this.actionStatus, markerStatus: this.markerStatus, markerHttpStatus: this.markerHttpStatus, lastMarker: this.lastMarker, timeline: this.timeline,
      clues: (this.frames.at(-1)?.clues ?? []).map((clue) => ({ ...clue, description: clueDescriptions[clue.category] })),
    });
  }
}
