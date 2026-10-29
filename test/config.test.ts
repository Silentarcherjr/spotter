import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisionFrameWidth, parseAiTimeoutMs } from '../src/config.ts';

test('vision frame width defaults to 1280 and validates environment values', () => {
  assert.equal(parseVisionFrameWidth(undefined), 1280);
  assert.equal(parseVisionFrameWidth('640'), 640);
  for (const value of ['no', '0', '-1', '1280.5', '100000']) assert.throws(() => parseVisionFrameWidth(value));
});

test('AI timeout defaults to 15000ms and validates environment values', () => {
  assert.equal(parseAiTimeoutMs(undefined), 15_000);
  assert.equal(parseAiTimeoutMs('30000'), 30_000);
  for (const value of ['no', '0', '-1', '1.5', '1000000']) assert.throws(() => parseAiTimeoutMs(value));
});
