import { decideExposure, initialExposure, scoreFindability } from '../core/exposure.ts';
import type { Clue, FrameObservation } from '../core/types.ts';
/** Observational replay only. Production score, decay, latch and action threshold are unchanged. */
export function replaySequence(rows: readonly { at: number; clues: readonly Clue[] | null }[]) {
  let history: FrameObservation[] = []; let state = initialExposure(); let firstCrossingMs: number | null = null; let unavailable = 0;
  const scores: number[] = []; const isolatedScores: (number | null)[] = []; let previous = -1;
  for (const row of rows) {
    if (!Number.isFinite(row.at) || row.at < 0 || row.at <= previous) throw Error('Sequence timestamps must increase'); previous = row.at;
    const isolated = row.clues === null ? null : scoreFindability(row.clues, [], row.at);
    const score = row.clues === null ? null : scoreFindability(row.clues, history, row.at);
    const decision = decideExposure(state, score); state = decision.state;
    if (row.clues === null) unavailable++;
    else {
      history = [...history.filter(frame => row.at-frame.at <= 120000), { at: row.at, clues: row.clues }];
      if (decision.actions.includes('privacy') && firstCrossingMs === null) firstCrossingMs = row.at;
    }
    scores.push(state.score); isolatedScores.push(isolated);
  }
  return { positive: firstCrossingMs !== null ? true : unavailable ? null : false, firstCrossingMs, unavailable, scores, isolatedScores };
}
