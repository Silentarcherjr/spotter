import { clamp, validClue } from './types.ts';
import type { Clue, FrameObservation } from './types.ts';

// A category contributes its strongest recent signal; repeating a frame cannot inflate it.
export function scoreFindability(
  clues: readonly Clue[],
  history: readonly FrameObservation[],
  now: number,
): number {
  const strengths = new Map<string, number>();
  for (const frame of [...history, { at: now, clues }]) {
    const age = now - frame.at;
    if (!Number.isFinite(age) || age < 0 || age > 120_000) continue;
    for (const clue of frame.clues.filter(validClue)) {
      const strength = clue.severity * clue.confidence * 8 * 2 ** (-age / 30_000);
      strengths.set(clue.category, Math.max(strengths.get(clue.category) ?? 0, strength));
    }
  }
  const values = [...strengths.values()].filter((value) => value > 0);
  const sum = values.reduce((total, value) => total + value, 0);
  // Combination bonus decays with evidence, including when no new frame arrives.
  const bonus = values.length > 1 ? (Math.min(...values) * (values.length - 1)) / 3 : 0;
  return Math.round(clamp(sum + bonus, 0, 100));
}
export interface ExposureState {
  score: number;
  active: boolean;
  dismissed: boolean;
  analysis: 'available' | 'analysis unavailable';
}
export const initialExposure = (): ExposureState => ({
  score: 0,
  active: false,
  dismissed: false,
  analysis: 'analysis unavailable',
});
export function decideExposure(
  previous: ExposureState,
  score: number | null,
  thresholds = { warn: 60, act: 80 },
): { state: ExposureState; actions: ('warn' | 'privacy' | 'marker')[] } {
  if (!(thresholds.warn > 0 && thresholds.act >= thresholds.warn && thresholds.act <= 100))
    throw new Error('Invalid exposure thresholds');
  if (score === null || !Number.isFinite(score))
    return { state: { ...previous, analysis: 'analysis unavailable' }, actions: [] };
  const value = clamp(score, 0, 100);
  const dismissed = previous.dismissed && value >= thresholds.warn;
  const active =
    !dismissed && (value >= thresholds.act || (previous.active && value >= thresholds.warn));
  const actions: ('warn' | 'privacy' | 'marker')[] = [];
  if (active && !previous.active) actions.push('privacy', 'marker');
  else if (!dismissed && value >= thresholds.warn && previous.score < thresholds.warn)
    actions.push('warn');
  return { state: { score: value, active, dismissed, analysis: 'available' }, actions };
}
export const dismissExposure = (state: ExposureState): ExposureState => ({
  ...state,
  active: false,
  dismissed: true,
});
