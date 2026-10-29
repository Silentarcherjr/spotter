import { decideExposure, initialExposure, scoreFindability } from '../../core/exposure.ts';
import type { Clue, FrameObservation } from '../../core/types.ts';
import type { VisionDetail } from '../../ai/responses.ts';

interface Options { analyze: (image: string) => Promise<Clue[]>; detail: VisionDetail; model: string; thresholds: { warn: number; act: number }; mock: boolean }
interface CalibrationFrame { frame: number; at: number; score: number; analysis: 'available' | 'analysis unavailable'; clues: Clue[]; wouldRequest: string[] }
export class VisionCalibration {
  private options: Options;
  private state = initialExposure();
  private history: FrameObservation[] = [];
  private rows: CalibrationFrame[] = [];
  private busy = false;
  constructor(options: Options) { this.options = options; decideExposure(this.state, 0, options.thresholds); }
  async sample(image: string, at: number): Promise<void> {
    if (this.busy || !Number.isFinite(at) || at < 0 || at <= (this.rows.at(-1)?.at ?? -1) || this.rows.length >= 10_000) throw new Error('Frames require increasing media timestamps and sequential analysis');
    this.busy = true;
    try {
      let clues: Clue[] | null;
      try { clues = await this.options.analyze(image); } catch { clues = null; }
      const score = clues === null ? null : scoreFindability(clues, this.history, at);
      const decision = decideExposure(this.state, score, this.options.thresholds);
      this.state = decision.state;
      if (clues !== null) this.history = [...this.history.filter((frame) => at - frame.at <= 120_000), { at, clues }];
      this.rows.push({ frame: this.rows.length + 1, at, score: this.state.score, analysis: this.state.analysis, clues: clues ?? [], wouldRequest: decision.actions });
    } finally { this.busy = false; }
  }
  report() {
    return structuredClone({ source: 'local_video', simulated: true as const, vision: this.options.mock ? 'mock' : 'real', model: this.options.model, detail: this.options.detail, thresholds: this.options.thresholds,
      actualActionsExecuted: false, successfulFrames: this.rows.filter((row) => row.analysis === 'available').length, unavailableFrames: this.rows.filter((row) => row.analysis !== 'available').length, frames: this.rows,
    });
  }
}
export type CalibrationReport = ReturnType<VisionCalibration['report']>;
export function calibrationCsv(report: CalibrationReport): string {
  return ['frame,media_time_ms,score,analysis,categories,would_request,simulated,vision', ...report.frames.map((row) => [row.frame, row.at, row.score, row.analysis, row.clues.map((clue) => clue.category).join('|'), row.wouldRequest.join('|'), 'true', report.vision].join(','))].join('\n') + '\n';
}
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function calibrationHtml(report: CalibrationReport): string {
  const end = Math.max(1, report.frames.at(-1)?.at ?? 1);
  const points = report.frames.map((row) => `${20 + row.at / end * 960},${180 - row.score * 1.6}`).join(' ');
  const thresholds = Object.values(report.thresholds).map((score) => `<path d="M20 ${180 - score * 1.6}H980" stroke="#eead56" stroke-dasharray="5 7"/>`).join('');
  return `<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spotter · Local video calibration</title><style>body{font:16px/1.6 system-ui;background:#10121c;color:#f2f2f9;max-width:1100px;margin:3rem auto;padding:1rem}strong{color:#eec16c}svg{width:100%;background:#1d2234;border-radius:16px}table{width:100%;border-collapse:collapse}td,th{padding:12px;text-align:left;border-bottom:1px solid #353c54}.missing{color:#eec16c}code{color:#a7edc0}</style><h1>Spotter / vision calibration</h1><strong>SIMULATED · ${report.vision === 'real' ? 'REAL VISION' : 'MOCK VISION'}</strong><p>Recorded input. No OBS, Twitch or privacy actions executed. ${report.successfulFrames} analyzed frames · ${report.unavailableFrames} unavailable.</p><p>Model: <code>${escape(report.model)}</code> · detail: ${report.detail} · thresholds ${report.thresholds.warn}/${report.thresholds.act}.</p><svg viewBox="0 0 1000 200" role="img" aria-label="Private exposure score across sampled video frames">${thresholds}<polyline points="${points}" fill="none" stroke="#b7f66f" stroke-width="3"/></svg><p>Horizontal axis: media time. Vertical axis: score 0–100. Dashed lines: warning/action thresholds. Unavailable rows retain the last score and never request actions. Only sampled frames are analyzed; no image or source filename is included.</p><table><thead><tr><th>Frame</th><th>Media time</th><th>Score</th><th>Analysis</th><th>Generic categories</th><th>Would request</th></tr></thead><tbody>${report.frames.map((row) => `<tr class="${row.analysis === 'available' ? '' : 'missing'}"><td>${row.frame}</td><td>${(row.at / 1000).toFixed(2)}s</td><td>${row.score}</td><td>${row.analysis}</td><td>${row.clues.map((clue) => clue.category).join(', ') || '—'}</td><td>${row.wouldRequest.join(', ') || '—'}</td></tr>`).join('')}</tbody></table><p>Private calibration evidence, not a safety guarantee. Low exposure means no obvious clues detected.</p></html>`;
}
