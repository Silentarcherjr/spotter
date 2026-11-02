import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replaySequence } from '../src/evaluation/sequences.ts';
import type { Clue } from '../src/core/types.ts';
import { OffTheMap } from '../src/modules/offthemap/runtime.ts';
const store: Clue = { category: 'storefront', severity: 5, confidence: 1 };
const transit: Clue = { category: 'transit', severity: 5, confidence: 1 };
test('sequence evaluation accumulates real history and resets between sequences', () => {
  const result = replaySequence([
    { at: 0, clues: [store] },
    { at: 4000, clues: [transit] },
  ]);
  assert.equal(result.positive, true);
  assert.equal(result.firstCrossingMs, 4000);
  assert.deepEqual(result.isolatedScores, [40, 40]);
  assert.ok(result.scores[1]! >= 80);
  assert.equal(replaySequence([{ at: 0, clues: [transit] }]).positive, false);
});
test('repeated categories cannot inflate, decay and unavailable frames use actual fail-soft semantics', () => {
  assert.equal(
    replaySequence(Array.from({ length: 10 }, (_, i) => ({ at: i * 4000, clues: [store] })))
      .positive,
    false,
  );
  assert.equal(
    replaySequence([
      { at: 0, clues: [store] },
      { at: 121000, clues: [transit] },
    ]).positive,
    false,
  );
  const result = replaySequence([
    { at: 0, clues: [store] },
    { at: 4000, clues: null },
  ]);
  assert.equal(result.positive, null);
  assert.equal(result.unavailable, 1);
  assert.deepEqual(result.scores, [40, 40]);
  assert.equal(
    replaySequence([
      { at: 0, clues: [store, transit] },
      { at: 4000, clues: null },
    ]).positive,
    true,
  );
  assert.throws(() =>
    replaySequence([
      { at: 10, clues: [] },
      { at: 0, clues: [] },
    ]),
  );
});
test('sequence replay matches production OffTheMap scores and first actual privacy action', async () => {
  const rows = [
    { at: 0, clues: [store] },
    { at: 4000, clues: [transit] },
    { at: 8000, clues: null },
    { at: 129000, clues: [] },
  ];
  const expected = replaySequence(rows);
  let index = 0;
  const scores: number[] = [];
  let privacy = 0;
  const run = new OffTheMap({
    capture: async () => 'memory',
    analyze: async () => {
      const clues = rows[index++]!.clues;
      if (clues === null) throw Error();
      return clues;
    },
    privacy: async () => {
      privacy++;
    },
    restore: async () => {},
    marker: async () => {},
  });
  for (const row of rows) {
    await run.sample(row.at);
    scores.push(run.snapshot().exposure.score);
  }
  assert.deepEqual(expected.scores, scores);
  assert.equal(privacy, 1);
});
test('natural holdout and sequence labels remain frozen with licensed source and timestamp provenance', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const root = 'test/fixtures/eval-temporal';
  const bytes = await readFile(`${root}/freeze.json`);
  const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(bytes), '3d0652debd2c6690aa6db3f8bb0dc2b7843f66cbd3eb564c466c32ad6e72aea5');
  const freeze = JSON.parse(bytes.toString()) as {
    labelsSha256: string;
    frames: Record<string, string>;
  };
  const labelsBytes = await readFile(`${root}/labels.json`);
  assert.equal(hash(labelsBytes), freeze.labelsSha256);
  const labels = JSON.parse(labelsBytes.toString()) as {
    clips: { id: string; author: string; url: string }[];
    holdout: string[];
    sequences: { frames: { id: string; at: number }[] }[];
  };
  assert.equal(labels.clips.length, 3);
  assert.equal(labels.holdout.length, 18);
  assert.equal(labels.sequences.length, 12);
  for (const clip of labels.clips) {
    assert.ok(clip.author);
    assert.match(clip.url, /^https:\/\/www\.pexels\.com\/video\//);
    assert.notEqual(clip.id, '8275531');
  }
  for (const sequence of labels.sequences) {
    assert.equal(sequence.frames.length, 10);
    let previous = -1;
    for (const frame of sequence.frames) {
      assert.match(freeze.frames[frame.id]!, /^[0-9a-f]{64}$/);
      assert.ok(frame.at > previous);
      previous = frame.at;
    }
  }
});
