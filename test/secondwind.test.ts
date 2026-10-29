import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SecondWind, parseNumericFeatures } from '../src/modules/secondwind/runtime.ts';
import { FeatureWindow } from '../sensor/features.ts';
import { advanceRally, initialRally, sessionReport } from '../src/core/session.ts';
import { calibrate } from '../src/core/energy.ts';

const features = (at: number) => ({ at, rms: .2, pitchMedian: 150, pitchRange: 50, spectralSlope: -2, voicedRatio: .7, pauseLength: .2, speechRate: 3 });

test('numeric sensor contract rejects audio, extra fields, invalid numbers and stale timestamps', () => {
  assert.deepEqual(parseNumericFeatures(features(1_000), 1_000), features(1_000));
  assert.throws(() => parseNumericFeatures({ ...features(1_000), audio: 'raw' }, 1_000));
  assert.throws(() => parseNumericFeatures({ ...features(1_000), rms: Number.NaN }, 1_000));
  assert.throws(() => parseNumericFeatures(features(0), 10_000));
  assert.throws(() => parseNumericFeatures({ ...features(1_000), speechRate: 1000 }, 1_000));
});

test('calibration cannot complete with sparse samples separated by ten minutes', () => {
  assert.equal(calibrate([features(0), features(600_000)], 600_000).baseline, null);
});

test('audio extraction recognizes a tone locally and emits only numeric features', () => {
  const window = new FeatureWindow(2048, 48_000);
  const tone = Float32Array.from({ length: 2048 }, (_, index) => .2 * Math.sin(2 * Math.PI * 150 * index / 48_000));
  const spectrum = new Float32Array(1024).fill(-60);
  for (let index = 0; index < 40; index++) window.push(tone, spectrum, index * 25);
  const packet = window.flush(1_000);
  assert.ok(packet);
  assert.ok(Math.abs(packet.pitchMedian - 150) < 3);
  assert.ok(packet.voicedRatio > .9);
  assert.ok(Object.values(packet).every((value) => typeof value === 'number' && Number.isFinite(value)));
});

test('Second Wind saves a personal baseline, reports missing sensor honestly and keeps rally separate', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const module = new SecondWind(db);
    for (let index = 0; index <= 600; index++) module.receive(features(index * 1000));
    assert.equal(module.snapshot(600_000).calibration, 1);
    assert.equal(module.snapshot(600_000).energy, 75);
    for (let index = 0; index < 20; index++) module.chat(`chat-${index}`, 601_000);
    assert.equal(module.snapshot(601_000).energy, 75);
    assert.equal(module.snapshot(601_000).rally.celebrating, true);
    assert.equal(module.snapshot(610_000).energy, null);
    assert.equal(new SecondWind(db).snapshot(600_000).calibration, 1);
    assert.ok(module.report().samples > 0);
    module.resetCalibration();
    assert.equal(module.snapshot(600_000).calibration, 0);
  } finally { db.close(); }
});

test('rally dedupes messages and report uses this session numeric data only', () => {
  let rally = initialRally();
  rally = advanceRally(rally, 'one', 0);
  assert.deepEqual(advanceRally(rally, 'one', 1), rally);
  for (let index = 1; index < 20; index++) rally = advanceRally(rally, `message-${index}`, index);
  assert.equal(rally.meter, 0);
  assert.ok(rally.celebratingUntil > 0);
  assert.equal(sessionReport([]).peak, null);
  const report = sessionReport([{ at: 0, energy: 80, chat: 10 }, { at: 1, energy: 40, chat: 5 }]);
  assert.equal(report.peak?.at, 0);
  assert.equal(report.low?.at, 1);
});

test('WebSocket accepts one numeric packet and closes raw-audio packets', async () => {
  const { createApp } = await import('../src/app.ts');
  const { once } = await import('node:events');
  const app = createApp({ databasePath: ':memory:', simulated: false });
  await app.ready();
  try {
    const socket = await app.injectWS('/api/sensor');
    const accepted = once(socket, 'message');
    socket.send(JSON.stringify(features(Date.now())));
    assert.match(String((await accepted)[0]), /accepted/);
    socket.terminate();
    const raw = await app.injectWS('/api/sensor');
    const closed = once(raw, 'close');
    raw.send(JSON.stringify({ audio: [1, 2, 3] }));
    assert.equal((await closed)[0], 1008);
    raw.terminate();
    const status = (await app.inject('/api/status')).json();
    assert.equal(status.sensorStatus, 'available');
    assert.equal(status.energy, null);
  } finally { await app.close(); }
});
