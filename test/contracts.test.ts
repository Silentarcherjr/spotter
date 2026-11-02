import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visionSchema, parseVision, visionPrompt } from '../src/ai/vision-contract.ts';
import { createSimEvent } from '../src/sim/events.ts';

function checkProperties(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const object = value as Record<string, unknown>;
  if (object.properties && typeof object.properties === 'object') {
    for (const key of Object.keys(object.properties))
      assert.doesNotMatch(
        key,
        /location|place|address|coord|latitude|longitude|city|country|street.?name|text|ocr/i,
      );
    assert.equal(object.additionalProperties, false);
  }
  for (const nested of Object.values(object)) checkProperties(nested);
}

test('vision schema recursively forbids location/text fields and additional properties', () => {
  checkProperties(visionSchema);
  assert.match(visionPrompt, /never transcribe/i);
  assert.match(visionPrompt, /never infer/i);
  assert.throws(() =>
    parseVision({
      clues: [
        { category: 'street_sign', description: '123 Example St', severity: 5, confidence: 1 },
      ],
    }),
  );
  assert.throws(() => parseVision({ clues: [], location: 'forbidden' }));
  assert.throws(() =>
    parseVision({
      clues: [
        {
          category: 'transit',
          description: 'Transit identifier visible',
          severity: 6,
          confidence: 1,
        },
      ],
    }),
  );
  assert.deepEqual(
    parseVision({
      clues: [
        {
          category: 'transit',
          description: 'Transit identifier visible',
          severity: 3,
          confidence: 0.8,
        },
      ],
    }),
    [{ category: 'transit', severity: 3, confidence: 0.8 }],
  );
});

test('simulation sources are gated and always override simulated:false', () => {
  assert.throws(() => createSimEvent(false, 'chat', { simulated: false }));
  const event = createSimEvent(true, 'chat', { simulated: false, count: 1 });
  assert.equal(event.simulated, true);
  assert.equal(event.kind, 'chat');
});
