import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVisionFrameWidth,
  parseAiTimeoutMs,
  parseEnergyAlertThreshold,
  parseTagOutEnergyThreshold,
  parseTagOutSustainS,
} from '../src/config.ts';

test('vision frame width defaults to 1280 and validates environment values', () => {
  assert.equal(parseVisionFrameWidth(undefined), 1280);
  assert.equal(parseVisionFrameWidth('640'), 640);
  for (const value of ['no', '0', '-1', '1280.5', '100000'])
    assert.throws(() => parseVisionFrameWidth(value));
});

test('AI timeout defaults to 15000ms and validates environment values', () => {
  assert.equal(parseAiTimeoutMs(undefined), 15_000);
  assert.equal(parseAiTimeoutMs('30000'), 30_000);
  for (const value of ['no', '0', '-1', '1.5', '1000000'])
    assert.throws(() => parseAiTimeoutMs(value));
});

test('combined energy threshold defaults to 45 and validates integer range', () => {
  assert.equal(parseEnergyAlertThreshold(), 45);
  assert.equal(parseEnergyAlertThreshold('60'), 60);
  for (const value of ['no', '0', '-1', '45.5', '101'])
    assert.throws(() => parseEnergyAlertThreshold(value));
});

test('Tag Out configuration defaults45/60s and rejects invalid values', () => {
  assert.equal(parseTagOutEnergyThreshold(), 45);
  assert.equal(parseTagOutEnergyThreshold('50'), 50);
  assert.equal(parseTagOutSustainS(), 60);
  assert.equal(parseTagOutSustainS('120'), 120);
  for (const v of ['0', '101', 'no', '45.5']) assert.throws(() => parseTagOutEnergyThreshold(v));
  for (const v of ['0', '3601', 'no', '1.5']) assert.throws(() => parseTagOutSustainS(v));
});
