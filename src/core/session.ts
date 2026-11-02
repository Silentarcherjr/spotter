import { correlation } from './chat.ts';
export interface CurvePoint {
  at: number;
  energy: number;
  chat: number;
}
export interface RallyState {
  meter: number;
  celebratingUntil: number;
  seenIds: readonly string[];
}
export const initialRally = (): RallyState => ({ meter: 0, celebratingUntil: 0, seenIds: [] });
export function advanceRally(previous: RallyState, messageId: string, now: number): RallyState {
  if (!messageId || previous.seenIds.includes(messageId)) return previous;
  const filled = previous.meter + 5;
  return {
    meter: filled >= 100 ? 0 : filled,
    celebratingUntil: filled >= 100 ? now + 5_000 : previous.celebratingUntil,
    seenIds: [...previous.seenIds, messageId].slice(-1_000),
  };
}
export function sessionReport(points: readonly CurvePoint[]) {
  const valid = points
    .filter((point) => Object.values(point).every(Number.isFinite))
    .toSorted((a, b) => a.at - b.at);
  const first = valid[0];
  const last = valid.at(-1);
  return {
    samples: valid.length,
    peak: valid.reduce<CurvePoint | null>(
      (best, point) => (!best || point.energy > best.energy ? point : best),
      null,
    ),
    low: valid.reduce<CurvePoint | null>(
      (best, point) => (!best || point.energy < best.energy ? point : best),
      null,
    ),
    energyChangePercent:
      first && last && first.energy > 0
        ? ((last.energy - first.energy) / first.energy) * 100
        : null,
    chatChangePercent:
      first && last && first.chat > 0 ? ((last.chat - first.chat) / first.chat) * 100 : null,
    correlation: correlation(valid),
    curves: valid,
  };
}
