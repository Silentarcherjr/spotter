import { distribution } from '../../observability/metrics.ts';
import type { TelemetryEvent } from '../../presentation/telemetry.ts';
import { decideExposure, dismissExposure, initialExposure, scoreFindability } from '../../core/exposure.ts';
import type { Clue, FrameObservation } from '../../core/types.ts';
import { clueDescriptions } from '../../ai/vision-contract.ts';

interface Dependencies { clock?: () => number; confirmPrivacy?: () => Promise<void>; available?: () => boolean; capture: () => Promise<string>; analyze: (frame: string) => Promise<Clue[]>; privacy: () => Promise<void>; restore: () => Promise<void>; marker: () => Promise<unknown> }
export class OffTheMap {
  private measurements: { captureMs: number | null; modelMs: number | null; decisionMs: number | null; analysisMs: number | null; sceneMs: number | null; unavailable: boolean; confirmationFailed: boolean }[] = [];
  latency() {
    const rows = this.measurements;
    return { window: 200, attempts: rows.length, unavailable: rows.filter(row => row.unavailable).length, confirmationFailed: rows.filter(row => row.confirmationFailed).length,
      capture: distribution(rows.flatMap(row => row.captureMs === null ? [] : [row.captureMs])), model: distribution(rows.flatMap(row => row.modelMs === null ? [] : [row.modelMs])), decision: distribution(rows.flatMap(row => row.decisionMs === null ? [] : [row.decisionMs])),
      analysis: distribution(rows.flatMap(row => row.analysisMs === null ? [] : [row.analysisMs])), scene: distribution(rows.flatMap(row => row.sceneMs === null ? [] : [row.sceneMs])) };
  }
  private dependencies: Dependencies;
  private thresholds: { warn: number; act: number };
  private exposure = initialExposure();
  private frames: FrameObservation[] = [];
  private lastPreview: { image: string; at: number; clues: Clue[] } | null = null;
  preview() { return this.lastPreview ? structuredClone(this.lastPreview) : null; }
  private busy = false;
  private dismissing = false;
  private privacyPending: Promise<void> | null = null;
  private revision = 0;
  private privacyActive = false;
  private actionStatus = 'idle';
  private markerStatus: 'idle' | 'created' | 'unavailable' = 'idle';
  private markerHttpStatus: number | null = null;
  private lastMarker: { id: string; positionSeconds: number; createdAt: string } | null = null;
  private presentationEvents: TelemetryEvent[] = [];
  private timeline: { at: number; score: number; actions: string[]; simulated: false }[] = [];
  constructor(dependencies: Dependencies, thresholds = { warn: 60, act: 80 }) { this.dependencies = dependencies; this.thresholds = thresholds; decideExposure(this.exposure, 0, thresholds); }
  async sample(now: number): Promise<void> {
    if (this.busy || this.dismissing) return;
    this.busy = true;
    const revision = this.revision;
    const clock = this.dependencies.clock ?? (() => performance.now()); const start = clock();
    const timing = { captureMs: null as number | null, modelMs: null as number | null, decisionMs: null as number | null, analysisMs: null as number | null, sceneMs: null as number | null, unavailable: false, confirmationFailed: false };
    try {
      let clues: Clue[]; let image: string;
      try { image = await this.dependencies.capture(); const captured = clock(); timing.captureMs = captured - start; clues = await this.dependencies.analyze(image); timing.modelMs = clock() - captured; }
      catch { timing.unavailable = true; this.lastPreview = null; this.exposure = decideExposure(this.exposure, null, this.thresholds).state; return; }
      if (revision !== this.revision || this.dependencies.available?.() === false) { timing.unavailable = true; this.lastPreview = null; this.exposure = decideExposure(this.exposure, null, this.thresholds).state; return; }
      this.lastPreview = /^data:image\/(?:jpeg|png);base64,/.test(image) && image.length <= 12_000_000 ? { image, at: now, clues: clues.map(clue => ({ ...clue, description: clueDescriptions[clue.category] })) } : null;
      const decision = decideExposure(this.exposure, scoreFindability(clues, this.frames, now), this.thresholds);
      timing.analysisMs = clock() - start; timing.decisionMs = Math.max(0, timing.analysisMs - timing.captureMs! - timing.modelMs!);
      this.exposure = decision.state;
      this.frames = [...this.frames.filter((frame) => now - frame.at <= 120_000), { at: now, clues }];
      this.timeline = [...this.timeline, { at: now, score: this.exposure.score, actions: decision.actions, simulated: false as const }].slice(-120);
      for (const action of decision.actions) {
        if (revision !== this.revision) return;
        if (this.dependencies.available?.() === false) { this.invalidateAnalysis(); return; }
        try {
          if (action === 'privacy') {
            const pending = this.dependencies.privacy(); this.privacyPending = pending;
            try { await pending; this.privacyActive = true;
              if (this.dependencies.confirmPrivacy) {
                try { await this.dependencies.confirmPrivacy(); timing.sceneMs = clock() - start; }
                catch { timing.confirmationFailed = true; }
              }
              this.actionStatus = 'privacy applied'; this.presentationEvents = [...this.presentationEvents, { at: now, label: 'Privacy', kind: 'privacy' as const }].slice(-120); }
            finally { if (this.privacyPending === pending) this.privacyPending = null; }
          }
          if (action === 'marker') {
            const response = await this.dependencies.marker() as { data?: { id?: unknown; position_seconds?: unknown; created_at?: unknown }[] } | undefined;
            this.markerStatus = 'created'; this.markerHttpStatus = null;
            const marker = response?.data?.[0];
            if (marker && (typeof marker.id === 'string' || typeof marker.id === 'number') && /^[A-Za-z0-9_-]{1,128}$/.test(String(marker.id)) && typeof marker.position_seconds === 'number' && Number.isFinite(marker.position_seconds) && typeof marker.created_at === 'string' && Number.isFinite(Date.parse(marker.created_at))) this.lastMarker = { id: String(marker.id), positionSeconds: marker.position_seconds, createdAt: marker.created_at };
          }
        } catch (error) {
          if (action === 'privacy') timing.confirmationFailed = true;
          this.actionStatus = 'action unavailable';
          if (action === 'marker') { this.markerStatus = 'unavailable'; const code = error instanceof Error ? /^Twitch request unavailable \((\d{3})\)$/.exec(error.message) : null; this.markerHttpStatus = code ? Number(code[1]) : null; }
        }
      }
    } finally { this.measurements = [...this.measurements, timing].slice(-200); this.busy = false; }
  }
  invalidateAnalysis(): void { this.lastPreview = null; this.revision++; this.exposure = decideExposure(this.exposure, null, this.thresholds).state; }
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
    return structuredClone({ presentationEvents: this.presentationEvents, simulated: false as const, analysis: this.exposure.analysis, exposure: this.exposure, privacyActive: this.privacyActive, actionStatus: this.actionStatus, markerStatus: this.markerStatus, markerHttpStatus: this.markerHttpStatus, lastMarker: this.lastMarker, timeline: this.timeline,
      clues: (this.frames.at(-1)?.clues ?? []).map((clue) => ({ ...clue, description: clueDescriptions[clue.category] })),
    });
  }
}
