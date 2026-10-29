import { decideExposure, dismissExposure, initialExposure, scoreFindability } from '../../core/exposure.ts';
import type { Clue, FrameObservation } from '../../core/types.ts';
import { clueDescriptions } from '../../ai/vision-contract.ts';

interface Dependencies { capture: () => Promise<string>; analyze: (frame: string) => Promise<Clue[]>; privacy: () => Promise<void>; restore: () => Promise<void>; marker: () => Promise<unknown> }
export class OffTheMap {
  private dependencies: Dependencies;
  private thresholds: { warn: number; act: number };
  private exposure = initialExposure();
  private frames: FrameObservation[] = [];
  private busy = false;
  private privacyActive = false;
  private actionStatus = 'idle';
  private timeline: { at: number; score: number; actions: string[]; simulated: false }[] = [];
  constructor(dependencies: Dependencies, thresholds = { warn: 60, act: 80 }) { this.dependencies = dependencies; this.thresholds = thresholds; decideExposure(this.exposure, 0, thresholds); }
  async sample(now: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      let clues: Clue[];
      try { clues = await this.dependencies.analyze(await this.dependencies.capture()); }
      catch { this.exposure = decideExposure(this.exposure, null, this.thresholds).state; return; }
      const decision = decideExposure(this.exposure, scoreFindability(clues, this.frames, now), this.thresholds);
      this.exposure = decision.state;
      this.frames = [...this.frames.filter((frame) => now - frame.at <= 120_000), { at: now, clues }];
      this.timeline = [...this.timeline, { at: now, score: this.exposure.score, actions: decision.actions, simulated: false as const }].slice(-120);
      for (const action of decision.actions) {
        try {
          if (action === 'privacy') { await this.dependencies.privacy(); this.privacyActive = true; this.actionStatus = 'privacy applied'; }
          if (action === 'marker') await this.dependencies.marker();
        } catch { this.actionStatus = 'action unavailable'; }
      }
    } finally { this.busy = false; }
  }
  async dismiss(): Promise<void> {
    if (this.busy) throw new Error('Analysis busy; retry dismissal');
    // Mark dismissal only after OBS acknowledges restoration, so a failed restore is retryable.
    await this.dependencies.restore();
    this.exposure = dismissExposure(this.exposure); this.privacyActive = false; this.actionStatus = 'dismissed';
  }
  snapshot() {
    return structuredClone({ simulated: false as const, analysis: this.exposure.analysis, exposure: this.exposure, privacyActive: this.privacyActive, actionStatus: this.actionStatus, timeline: this.timeline,
      clues: (this.frames.at(-1)?.clues ?? []).map((clue) => ({ ...clue, description: clueDescriptions[clue.category] })),
    });
  }
}
