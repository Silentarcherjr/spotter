import { clamp } from './types.ts';
import type { AudioFeatures } from './types.ts';

const metrics = [
  'rms',
  'pitchMedian',
  'pitchRange',
  'spectralSlope',
  'voicedRatio',
  'pauseLength',
  'speechRate',
] as const;
type Metric = (typeof metrics)[number];
export interface Baseline {
  mean: Record<Metric, number>;
  deviation: Record<Metric, number>;
}
const floors: Record<Metric, number> = {
  rms: 0.02,
  pitchMedian: 15,
  pitchRange: 10,
  spectralSlope: 1,
  voicedRatio: 0.1,
  pauseLength: 0.1,
  speechRate: 0.5,
};
const weights: Record<Metric, number> = {
  rms: 0.3,
  pitchMedian: 0.05,
  pitchRange: 0.2,
  spectralSlope: 0.05,
  voicedRatio: 0.15,
  pauseLength: -0.1,
  speechRate: 0.15,
};
export function validAudio(sample: AudioFeatures): boolean {
  return (
    [sample.at, ...metrics.map((metric) => sample[metric])].every(Number.isFinite) &&
    sample.rms >= 0 &&
    sample.rms <= 1 &&
    sample.pitchMedian >= 0 &&
    sample.pitchRange >= 0 &&
    sample.voicedRatio >= 0 &&
    sample.voicedRatio <= 1 &&
    sample.pauseLength >= 0 &&
    sample.speechRate >= 0
  );
}
export function calibrate(
  samples: readonly AudioFeatures[],
  now: number,
): { progress: number; baseline: Baseline | null } {
  const valid = samples
    .filter((sample) => validAudio(sample) && sample.at <= now)
    .toSorted((a, b) => a.at - b.at);
  const start = valid[0]?.at;
  const end = valid.at(-1)?.at;
  const progress =
    start === undefined || end === undefined ? 0 : clamp((end - start) / 600_000, 0, 1);
  if (progress < 1 || start === undefined) return { progress, baseline: null };
  const window = valid.filter((sample) => sample.at <= start + 600_000);
  if (window.length < 300) return { progress, baseline: null };
  const mean = {} as Record<Metric, number>;
  const deviation = {} as Record<Metric, number>;
  for (const metric of metrics) {
    mean[metric] = window.reduce((sum, sample) => sum + sample[metric], 0) / window.length;
    const variance =
      window.reduce((sum, sample) => sum + (sample[metric] - mean[metric]) ** 2, 0) / window.length;
    deviation[metric] = Math.max(floors[metric], Math.sqrt(variance));
  }
  return { progress, baseline: { mean, deviation } };
}
export function scoreEnergy(
  samples: readonly AudioFeatures[],
  baseline: Baseline | null,
  now: number,
): number | null {
  if (
    !baseline ||
    metrics.some(
      (metric) =>
        !Number.isFinite(baseline.mean[metric]) ||
        !Number.isFinite(baseline.deviation[metric]) ||
        baseline.deviation[metric] <= 0,
    )
  )
    return null;
  const recent = samples.filter(
    (sample) => validAudio(sample) && sample.at <= now && now - sample.at <= 45_000,
  );
  if (!recent.length) return null;
  const z =
    recent.reduce(
      (total, sample) =>
        total +
        metrics.reduce(
          (sum, metric) =>
            sum +
            weights[metric] *
              clamp((sample[metric] - baseline.mean[metric]) / baseline.deviation[metric], -3, 3),
          0,
        ),
      0,
    ) / recent.length;
  return Math.round(clamp(75 + z * 20, 0, 100));
}
