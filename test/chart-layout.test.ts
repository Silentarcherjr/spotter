import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatSeriesState, placeAnnotationLabels } from '../src/presentation/chart-layout.ts';

test('chat presentation hides absent and zero-only activity without inventing a zero line', () => {
  for (const points of [
    [],
    [{ at: 0, energy: 44, chat: null }],
    [{ at: 0, energy: 44, chat: 0 }],
  ]) {
    assert.equal(chatSeriesState(points).visible, false);
    assert.equal(chatSeriesState(points).legend, 'chat not recorded');
  }
  const mixed = [
    { at: 0, energy: 44, chat: 0 },
    { at: 1000, energy: 45, chat: 3 },
  ];
  assert.equal(chatSeriesState(mixed).visible, true);
  assert.equal(chatSeriesState(mixed).n, 2); // Keep genuine zero samples in a measured active series.
});

test('annotation placement avoids overlap for coincident events and viewport edges', () => {
  for (const anchor of [38, 300, 582]) {
    const placements = placeAnnotationLabels(
      Array.from({ length: 5 }, (_, index) => ({ index, anchor, width: 115 + index * 7 })),
      38,
      582,
    );
    assert.equal(placements.length, 5);
    for (const a of placements) {
      assert.ok(a.x >= 38 && a.x + a.width <= 582);
      for (const b of placements)
        if (a.index !== b.index && a.row === b.row)
          assert.ok(a.x + a.width + 8 <= b.x || b.x + b.width + 8 <= a.x);
    }
  }
});

test('annotation overflow is omitted rather than overlapping or leaving the plot', () => {
  assert.deepEqual(placeAnnotationLabels([{ index: 0, anchor: 50, width: 1000 }], 38, 100), []);
});
