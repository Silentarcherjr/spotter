import { ResponsesAI } from '../src/ai/responses.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribution, confusion } from '../src/observability/metrics.ts';
import { parseVisionCaptureIntervalMs } from '../src/config.ts';
import { OffTheMap } from '../src/modules/offthemap/runtime.ts';
test('latency median and nearest-rank p95 do not invent empty observations', () => {
  assert.deepEqual(distribution([]), { n: 0, medianMs: null, p95Ms: null });
  assert.deepEqual(distribution(Array.from({ length: 20 }, (_, i) => i + 1)), {
    n: 20,
    medianMs: 10.5,
    p95Ms: 19,
  });
  assert.throws(() => distribution([-1]));
});
test('capture interval defaults to four seconds and supports two; invalid intervals fail', () => {
  assert.equal(parseVisionCaptureIntervalMs(), 4000);
  assert.equal(parseVisionCaptureIntervalMs('2000'), 2000);
  for (const value of ['0', 'NaN', '2.5']) assert.throws(() => parseVisionCaptureIntervalMs(value));
});
test('evaluation confusion matrix reports unavailable separately and undefined precision honestly', () => {
  assert.deepEqual(
    confusion([
      { expected: true, predicted: true },
      { expected: true, predicted: false },
      { expected: false, predicted: true },
      { expected: false, predicted: false },
      { expected: true, predicted: null },
    ]),
    { tp: 1, fp: 1, fn: 1, tn: 1, unavailable: 1, n: 5, precision: 0.5, recall: 0.5 },
  );
  assert.equal(confusion([{ expected: true, predicted: false }]).precision, null);
});
test('real timings end at scene confirmation, exclude markers and omit missing or unconfirmed protection', async () => {
  let time = 0;
  let fail = false;
  const module = new OffTheMap({
    clock: () => time,
    capture: async () => {
      time += 10;
      if (fail) throw Error();
      return 'frame';
    },
    analyze: async () => {
      time += 100;
      return [
        { category: 'transit', severity: 5, confidence: 1 },
        { category: 'storefront', severity: 5, confidence: 1 },
      ];
    },
    privacy: async () => {
      time += 20;
    },
    confirmPrivacy: async () => {
      time += 5;
    },
    restore: async () => {},
    marker: async () => {
      time += 999;
    },
  });
  await module.sample(0);
  assert.equal(module.latency().scene.medianMs, 135);
  assert.equal(module.latency().analysis.medianMs, 110);
  fail = true;
  await module.sample(4000);
  assert.equal(module.latency().unavailable, 1);
  assert.equal(module.latency().scene.n, 1);
  const unconfirmed = new OffTheMap({
    capture: async () => 'frame',
    analyze: async () => [
      { category: 'transit', severity: 5, confidence: 1 },
      { category: 'storefront', severity: 5, confidence: 1 },
    ],
    privacy: async () => {},
    restore: async () => {},
    marker: async () => {},
  });
  await unconfirmed.sample(0);
  assert.equal(unconfirmed.latency().scene.n, 0);
});
test('authored evaluation has 30 original images and 40 balanced messages with frozen labels', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const root = 'test/fixtures/eval';
  const frames = JSON.parse(await readFile(`${root}/frames.json`, 'utf8')) as {
    file: string;
    warn: boolean;
    act: boolean;
  }[];
  const chat = JSON.parse(await readFile(`${root}/chat.json`, 'utf8')) as { guessing: boolean }[];
  assert.equal(frames.length, 30);
  assert.equal(chat.length, 40);
  assert.equal(chat.filter((row) => row.guessing).length, 20);
  assert.equal(frames.filter((row) => row.warn).length, 20);
  assert.equal(frames.filter((row) => row.act).length, 10);
  const hash = createHash('sha256');
  for (const path of ['frames.json', 'chat.json', ...frames.map((row) => row.file)])
    hash.update(await readFile(`${root}/${path}`));
  assert.equal(
    hash.digest('hex'),
    'ec3710e8f14bb2737d2772c9ef049c473c046e00a505a6a7bded3a91acd9d79c',
  );
});
test('failed scene readback does not count as completed protection or change the action policy', async () => {
  let markers = 0;
  const run = new OffTheMap({
    capture: async () => 'frame',
    analyze: async () => [
      { category: 'transit', severity: 5, confidence: 1 },
      { category: 'storefront', severity: 5, confidence: 1 },
    ],
    privacy: async () => {},
    confirmPrivacy: async () => {
      throw Error('readback failed');
    },
    restore: async () => {},
    marker: async () => {
      markers++;
    },
  });
  await run.sample(0);
  assert.equal(run.latency().scene.n, 0);
  assert.equal(run.latency().confirmationFailed, 1);
  assert.equal(run.snapshot().privacyActive, true);
  assert.equal(markers, 1);
});
test('latency endpoint never exposes images and simulation never invents live timings', async () => {
  const { createApp } = await import('../src/app.ts');
  const app = createApp({
    databasePath: ':memory:',
    simulated: true,
    visionCaptureIntervalMs: 2000,
  });
  try {
    const response = await app.inject('/api/latency');
    const body = response.json();
    assert.equal(body.simulated, true);
    assert.equal(body.live, null);
    assert.equal(body.captureIntervalMs, 2000);
    assert.doesNotMatch(response.body, /data:image|password|api_key/i);
  } finally {
    await app.close();
  }
});
test('OBS readback confirms the intended scene and rejects a mismatched program scene', async () => {
  const { ObsClient } = await import('../src/obs/client.ts');
  let scene = 'Main';
  const wire = {
    on() {},
    async connect() {},
    async disconnect() {},
    async call() {
      return { currentProgramSceneName: scene };
    },
  };
  const obs = new ObsClient(
    { url: 'ws://127.0.0.1:4455', password: '', privacyScene: 'Privacy' },
    wire as unknown as import('../src/obs/client.ts').ObsWire,
  );
  await obs.start();
  try {
    await assert.rejects(obs.confirmPrivacy());
    scene = 'Privacy';
    await obs.confirmPrivacy();
  } finally {
    await obs.stop();
  }
});
test('controlled OBS benchmark refuses active stream or recording without switching a scene', async () => {
  const { benchmarkLatency } = await import('../src/obs/latency-benchmark.ts');
  for (const active of ['GetStreamStatus', 'GetRecordStatus']) {
    const calls: string[] = [];
    const wire = {
      on() {},
      async connect() {},
      async disconnect() {},
      async call(name: string) {
        calls.push(name);
        return { outputActive: name === active };
      },
    };
    const ai = new ResponsesAI({
      key: 'fake',
      model: 'fake',
      fetcher: async () => {
        throw Error('must not call model');
      },
    });
    await assert.rejects(
      benchmarkLatency(
        { url: 'ws://127.0.0.1:4455', password: '', privacyScene: 'Privacy' },
        ai,
        4000,
        1,
        () => {},
        undefined,
        undefined,
        wire as unknown as import('../src/obs/client.ts').ObsWire,
      ),
    );
    assert.ok(!calls.some((name) => /Set|Trigger|Screenshot/.test(name)));
  }
});
