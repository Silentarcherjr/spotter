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
    await assert.rejects(app.injectWS('/api/sensor', { headers: { host: '127.0.0.1:3210', origin: 'https://foreign.example' } }));
    const socket = await app.injectWS('/api/sensor', { headers: { host: '127.0.0.1:3210' } });
    const accepted = once(socket, 'message');
    socket.send(JSON.stringify(features(Date.now())));
    assert.match(String((await accepted)[0]), /accepted/);
    socket.terminate();
    const raw = await app.injectWS('/api/sensor', { headers: { host: '127.0.0.1:3210' } });
    const closed = once(raw, 'close');
    raw.send(JSON.stringify({ audio: [1, 2, 3] }));
    assert.equal((await closed)[0], 1008);
    raw.terminate();
    const status = (await app.inject('/api/status')).json();
    assert.equal(status.sensorStatus, 'available');
    assert.equal(status.energy, null);
  } finally { await app.close(); }
});

test('file audio uses an isolated simulated baseline without switching real integrations into demo mode', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const module = new SecondWind(db);
    for (let i = 0; i <= 600; i++) module.receive(features(i * 1000));
    module.selectSource('file');
    assert.equal(module.snapshot(600_000).calibrated, false);
    for (let i = 0; i <= 600; i++) module.receive({ ...features(700_000 + i * 1000), rms: .4 });
    const file = module.snapshot(1_300_000);
    assert.equal(file.simulated, false); assert.equal(file.audioSimulated, true); assert.equal(file.audioSource, 'file');
    assert.equal(file.calibrated, true); assert.equal(file.energy, 75);
    module.selectSource('microphone');
    module.receive(features(1_301_000));
    assert.equal(module.snapshot(1_301_000).audioSimulated, false);
    assert.equal(module.snapshot(1_301_000).energy, 75);
    module.selectSource('file');
    assert.equal(module.snapshot(1_301_000).calibrated, true);
    module.resetCalibration();
    module.selectSource('microphone');
    assert.equal(module.snapshot(1_301_000).calibrated, true);
  } finally { db.close(); }
});

test('file sensor accepts only numeric features and marks the public HUD simulated even when disabled', async () => {
  const { createApp } = await import('../src/app.ts'); const { once } = await import('node:events');
  const app = createApp({ databasePath: ':memory:', simulated: false });
  try {
    await app.ready();
    await assert.rejects(app.injectWS('/api/sensor?source=unknown', { headers: { host: '127.0.0.1:3210' } }));
    const socket = await app.injectWS('/api/sensor?source=file', { headers: { host: '127.0.0.1:3210' } });
    const ack = once(socket, 'message'); socket.send(JSON.stringify(features(Date.now()))); await ack;
    const status = (await app.inject('/api/status')).json();
    assert.equal(status.simulated, false); assert.equal(status.audioSimulated, true); assert.equal(status.audioSource, 'file');
    assert.equal((await app.inject('/api/overlay')).json().simulated, true);
    await app.inject({ method: 'POST', url: '/api/hud', payload: { enabled: true } });
    const hud = (await app.inject('/api/overlay')).json(); assert.equal(hud.simulated, true); assert.equal(hud.enabled, true);
    assert.doesNotMatch(JSON.stringify(hud), /clues|exposure|audio/);
    socket.terminate();
  } finally { await app.close(); }
});

test('calibration completes with normal packet jitter instead of trimming its first sample too early', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const module = new SecondWind(db); module.selectSource('file');
    for (let i = 0; i <= 610; i++) module.receive(features(i * 1003));
    assert.equal(module.snapshot(610 * 1003).calibrated, true);
  } finally { db.close(); }
});

test('live status publishes the configured energy alert threshold and rejects invalid configuration', async () => {
  const { createApp } = await import('../src/app.ts');
  const app = createApp({ databasePath: ':memory:', simulated: false, energyAlertThreshold: 50 });
  try {
    const status = (await app.inject('/api/status')).json();
    assert.equal(status.energyAlertThreshold, 50);
    assert.equal(status.combinedAlert, false);
  } finally { await app.close(); }
  assert.throws(() => createApp({ databasePath: ':memory:', simulated: false, energyAlertThreshold: 101 }));
});
