import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResponsesAI } from '../src/ai/responses.ts';
import { OffTheMap } from '../src/modules/offthemap/runtime.ts';
import { ObsClient } from '../src/obs/client.ts';
import type { ObsWire } from '../src/obs/client.ts';

const completed = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));
test('Responses vision uses configured model, strict schema, in-memory image and store:false', async () => {
  let request: Record<string, unknown> = {};
  const ai = new ResponsesAI({ key: 'fake-key', model: 'configured-model', fetcher: async (_url, init) => { request = JSON.parse(init?.body as string) as typeof request; return completed({ clues: [] }); } });
  assert.deepEqual(await ai.vision('data:image/jpeg;base64,AA=='), []);
  assert.equal(request.model, 'configured-model');
  assert.equal(request.store, false);
  assert.match(JSON.stringify(request.text), /json_schema/);
  const refusing = new ResponsesAI({ key: 'fake-key', model: 'configured-model', fetcher: async () => new Response(JSON.stringify({ status: 'incomplete', output: [] })) });
  await assert.rejects(refusing.vision('data:image/jpeg;base64,AA=='));
  await assert.rejects(ai.vision('https://untrusted.example/frame.jpg'));
});

test('Off the Map fails soft, retains score, never acts on missing data and restores on dismissal', async () => {
  let unavailable = false;
  let privacyCalls = 0;
  let restored = 0;
  let markers = 0;
  const module = new OffTheMap({
    capture: async () => 'data:image/jpeg;base64,AA==',
    analyze: async () => { if (unavailable) throw new Error('upstream failed'); return [{ category: 'transit', severity: 5, confidence: 1 }, { category: 'storefront', severity: 5, confidence: 1 }]; },
    privacy: async () => { privacyCalls++; }, restore: async () => { restored++; }, marker: async () => { markers++; },
  });
  await module.sample(0);
  assert.equal(privacyCalls, 1); assert.equal(markers, 1);
  assert.equal(module.snapshot().exposure.score, 93);
  unavailable = true;
  await module.sample(4_000);
  assert.equal(module.snapshot().exposure.score, 93);
  assert.equal(module.snapshot().analysis, 'analysis unavailable');
  assert.equal(privacyCalls, 1); assert.equal(markers, 1);
  await module.dismiss();
  assert.equal(restored, 1);
  assert.equal(module.snapshot().privacyActive, false);
});

test('OBS captures default 1280px JPEG, restores exact prior scene and survives closed OBS', async () => {
  const calls: { request: string; data: unknown }[] = [];
  const wire = {
    on() {}, async connect() {}, async disconnect() {},
    async call(request: string, data: unknown) {
      calls.push({ request, data });
      if (request === 'GetCurrentProgramScene') return { currentProgramSceneName: 'Main' };
      if (request === 'GetSourceScreenshot') return { imageData: 'data:image/jpeg;base64,AA==' };
      return {};
    },
  } as unknown as ObsWire;
  const obs = new ObsClient({ url: 'ws://127.0.0.1:4455', password: '', privacyScene: 'Privacy' }, wire);
  await obs.start();
  assert.equal(await obs.capture(), 'data:image/jpeg;base64,AA==');
  assert.deepEqual(calls.find((call) => call.request === 'GetSourceScreenshot')?.data, { sourceName: 'Main', imageFormat: 'jpg', imageWidth: 1280 });
  await obs.applyPrivacy(); await obs.restore();
  assert.deepEqual(calls.filter((call) => call.request === 'SetCurrentProgramScene').map((call) => call.data), [{ sceneName: 'Privacy' }, { sceneName: 'Main' }]);
  await obs.stop();
  const closed = new ObsClient({ url: 'ws://127.0.0.1:4455', password: '', privacyScene: 'Privacy' }, { ...wire, async connect() { throw new Error('OBS closed'); } } as ObsWire);
  await closed.start(); assert.equal(closed.connected, false); await closed.stop();
});

test('Chat Guard never deletes on classifier failure and audits approved deletions by ID only', async () => {
  const { ChatGuard } = await import('../src/modules/offthemap/chat-guard.ts');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  let unavailable = true;
  const removed: string[] = [];
  const guard = new ChatGuard(db, { classify: async () => { if (unavailable) throw new Error('unavailable'); return { guessing: true, confidence: .95 }; }, remove: async (id) => { removed.push(id); }, notify: async () => {} });
  try {
    await guard.check('message-1', 'private fixture content', 0);
    assert.equal(removed.length, 0);
    unavailable = false;
    await guard.check('message-2', 'private fixture content', 1);
    assert.deepEqual(removed, ['message-2']);
    assert.equal(guard.snapshot().entries[0]?.id, 'message-2');
    assert.ok(!JSON.stringify(guard.snapshot()).includes('private fixture content'));
  } finally { db.close(); }
});

test('exposure warning/action thresholds are configurable and validated before startup', async () => {
  let actions = 0;
  const dependencies = { capture: async () => 'data:image/jpeg;base64,AA==', analyze: async () => [{ category: 'transit' as const, severity: 3, confidence: 1 }], privacy: async () => { actions++; }, restore: async () => {}, marker: async () => {} };
  assert.throws(() => new OffTheMap(dependencies, { warn: 90, act: 60 }));
  const module = new OffTheMap(dependencies, { warn: 10, act: 20 });
  await module.sample(0);
  assert.equal(actions, 1);
});

for (const detail of [undefined, 'low', 'high', 'auto'] as const) {
  test(`vision detail ${detail ?? 'default'} is sent to Responses`, async () => {
    let actual: unknown;
    const ai = new ResponsesAI({ key: 'fake-key', model: 'configured-model', ...(detail ? { detail } : {}), fetcher: async (_url, init) => {
      const body = JSON.parse(init?.body as string) as { input: { content: { detail: string }[] }[] };
      actual = body.input[0]?.content[0]?.detail;
      return completed({ clues: [] });
    } });
    await ai.vision('data:image/jpeg;base64,AA==');
    assert.equal(actual, detail ?? 'high');
  });
}

test('invalid vision detail is rejected before any network call', () => {
  assert.throws(() => new ResponsesAI({ key: 'fake-key', model: 'configured-model', detail: 'invalid' as 'high' }));
});

for (const [baseURL, endpoint, routed] of [
  [undefined, 'https://api.openai.com/v1/responses', false],
  ['https://api.openai.com/v1/', 'https://api.openai.com/v1/responses', false],
  ['https://openrouter.ai/api/v1', 'https://openrouter.ai/api/v1/responses', true],
  ['https://openrouter.ai/api/v1/', 'https://openrouter.ai/api/v1/responses', true],
  ['https://openrouter.ai.example/v1', 'https://openrouter.ai.example/v1/responses', false],
  ['https://gateway.example/v1', 'https://gateway.example/v1/responses', false],
] as const) {
  test(`Responses routing contract for ${baseURL ?? 'default OpenAI'}`, async () => {
    let calls = 0;
    const ai = new ResponsesAI({ key: 'fake-key', model: 'provider/model', ...(baseURL ? { baseURL } : {}), fetcher: async (url, init) => {
      calls++;
      assert.equal(String(url), endpoint);
      const body = JSON.parse(init?.body as string) as { store: boolean; model: string; provider?: unknown; text: { format: { type: string; strict: boolean } }; input: { content: { type: string }[] }[] };
      assert.equal(body.store, false);
      assert.equal(body.model, 'provider/model');
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(body.text.format.strict, true);
      assert.deepEqual(body.provider, routed ? { require_parameters: true } : undefined);
      assert.equal(Object.hasOwn(body, 'provider'), routed);
      const image = body.input[0]?.content[0]?.type === 'input_image';
      return completed(image ? { clues: [] } : { guessing: false, confidence: .9 });
    } });
    assert.deepEqual(await ai.vision('data:image/jpeg;base64,AA=='), []);
    assert.deepEqual(await ai.classifyChat('ordinary fixture'), { guessing: false, confidence: .9 });
    assert.equal(calls, 2);
  });
}

test('OpenRouter schema rejection retains the score and cannot cause a new automatic action', async () => {
  let rejected = false;
  let actions = 0;
  const ai = new ResponsesAI({ key: 'fake-key', model: 'provider/model', baseURL: 'https://openrouter.ai/api/v1', fetcher: async () => rejected
    ? new Response(JSON.stringify({ error: { message: 'private upstream schema detail' } }), { status: 400 })
    : completed({ clues: [{ category: 'transit', description: 'Transit identifier visible', severity: 5, confidence: 1 }, { category: 'storefront', description: 'Identifying storefront visible', severity: 5, confidence: 1 }] }),
  });
  const module = new OffTheMap({ capture: async () => 'data:image/jpeg;base64,AA==', analyze: (image) => ai.vision(image), privacy: async () => { actions++; }, marker: async () => { actions++; }, restore: async () => {} });
  await module.sample(0);
  const score = module.snapshot().exposure.score;
  assert.equal(score, 93); assert.equal(actions, 2);
  rejected = true;
  await module.sample(4000);
  assert.equal(module.snapshot().exposure.score, score);
  assert.equal(module.snapshot().analysis, 'analysis unavailable');
  assert.equal(actions, 2);
  await assert.rejects(ai.classifyChat('ordinary fixture'), { message: 'analysis unavailable' });
  assert.doesNotMatch(JSON.stringify(module.snapshot()), /private upstream/);
});

test('invalid AI base URLs fail before any request', () => {
  for (const baseURL of ['not-a-url', 'file:///tmp/api', 'https://user:password@openrouter.ai/api/v1', 'https://openrouter.ai/api/v1?key=secret']) {
    assert.throws(() => new ResponsesAI({ key: 'fake-key', model: 'provider/model', baseURL }));
  }
});

for (const timeoutMs of [undefined, 45] as const) {
  test(`AI timeout is configurable (${timeoutMs ?? '15000 default'}ms)`, async () => {
    const original = AbortSignal.timeout;
    const seen: number[] = [];
    AbortSignal.timeout = (milliseconds: number) => { seen.push(milliseconds); return original(milliseconds); };
    try {
      const ai = new ResponsesAI({ key: 'fake-key', model: 'configured-model', ...(timeoutMs ? { timeoutMs } : {}), fetcher: async () => completed({ clues: [] }) });
      await ai.vision('data:image/jpeg;base64,AA==');
      assert.deepEqual(seen, [timeoutMs ?? 15_000]);
    } finally { AbortSignal.timeout = original; }
  });
}

test('OBS accepts a configured frame width and rejects invalid widths', async () => {
  let width = 0;
  const wire = { on() {}, async connect() {}, async disconnect() {}, async call(request: string, data: { imageWidth?: number }) { if (request === 'GetSourceScreenshot') { width = data.imageWidth ?? 0; return { imageData: 'data:image/jpeg;base64,AA==' }; } return { currentProgramSceneName: 'Main' }; } } as unknown as ObsWire;
  const config = { url: 'ws://127.0.0.1:4455', password: '', privacyScene: 'Privacy', frameWidth: 1920 };
  const obs = new ObsClient(config, wire);
  await obs.start(); await obs.capture(); await obs.stop();
  assert.equal(width, 1920);
  assert.throws(() => new ObsClient({ ...config, frameWidth: -1 }, wire));
});

test('provider rejection exposes only a sanitized diagnostic, never its raw body', async () => {
  const ai = new ResponsesAI({ key: 'fake-key', model: 'configured-model', fetcher: async () => new Response(JSON.stringify({ error: { message: 'private provider content' } }), { status: 400 }) });
  await assert.rejects(ai.vision('data:image/jpeg;base64,AA=='), (error: unknown) => {
    const diagnostic = error as Error & { reason?: string; httpStatus?: number };
    assert.equal(diagnostic.message, 'analysis unavailable');
    assert.equal(diagnostic.reason, 'http_error');
    assert.equal(diagnostic.httpStatus, 400);
    assert.doesNotMatch(JSON.stringify(diagnostic), /private provider content/);
    return true;
  });
});

test('a configured timeout actually aborts the request and returns a sanitized reason', async () => {
  const ai = new ResponsesAI({ key: 'fake-key', model: 'configured-model', timeoutMs: 10, fetcher: async (_url, init) => new Promise((_resolve, reject) => {
    const guard = setTimeout(() => reject(new Error('did not abort')), 1000);
    init?.signal?.addEventListener('abort', () => { clearTimeout(guard); reject(init.signal?.reason); }, { once: true });
  }) });
  await assert.rejects(ai.vision('data:image/jpeg;base64,AA=='), (error: unknown) => {
    assert.equal((error as Error & { reason?: string }).reason, 'timeout'); return true;
  });
});

test('disconnect invalidates in-flight vision and prevents stale privacy/marker actions', async () => {
  let resolveVision!: (value: import('../src/core/types.ts').Clue[]) => void;
  let actions = 0;
  const module = new OffTheMap({ capture: async () => 'data:image/jpeg;base64,AA==', analyze: () => new Promise((resolve) => { resolveVision = resolve; }), privacy: async () => { actions++; }, restore: async () => {}, marker: async () => { actions++; } });
  const pending = module.sample(0);
  await new Promise<void>((resolve) => setImmediate(resolve));
  module.invalidateAnalysis();
  resolveVision([{ category: 'storefront', severity: 5, confidence: 1 }, { category: 'transit', severity: 5, confidence: 1 }]);
  await pending;
  assert.equal(module.snapshot().analysis, 'analysis unavailable');
  assert.equal(module.snapshot().exposure.score, 0);
  assert.equal(module.snapshot().timeline.length, 0);
  assert.equal(actions, 0);
});

test('OBS image/jpg captures are normalized to image/jpeg before real vision validation', async () => {
  const obs = new ObsClient({ url: 'ws://127.0.0.1:4455', password: '', privacyScene: 'Privacy', source: 'Clip' }, { on() {}, async connect() {}, async disconnect() {}, async call() { return { imageData: 'data:image/jpg;base64,AA==' }; } } as unknown as ObsWire);
  await obs.start();
  try {
    const image = await obs.capture();
    assert.equal(image, 'data:image/jpeg;base64,AA==');
    const ai = new ResponsesAI({ key: 'fake', model: 'configured-model', fetcher: async () => completed({ clues: [] }) });
    assert.deepEqual(await ai.vision(image), []);
  } finally { await obs.stop(); }
});

test('marker confirmation retains only receipt fields and distinguishes a rejected marker from applied privacy', async () => {
  for (const rejected of [false, true]) {
    const module = new OffTheMap({ capture: async () => 'data:image/jpeg;base64,AA==', analyze: async () => [{ category: 'storefront', severity: 5, confidence: 1 }, { category: 'transit', severity: 5, confidence: 1 }], privacy: async () => {}, restore: async () => {}, marker: async () => {
      if (rejected) throw new Error('Twitch request unavailable (404)');
      return { data: [{ id: 'marker-1', position_seconds: 42, created_at: '2026-10-29T12:00:00Z', extra: 'never stored' }] };
    } });
    await module.sample(0);
    const state = module.snapshot();
    assert.equal(state.privacyActive, true);
    assert.equal(state.markerStatus, rejected ? 'unavailable' : 'created');
    assert.equal(state.markerHttpStatus, rejected ? 404 : null);
    assert.deepEqual(state.lastMarker, rejected ? null : { id: 'marker-1', positionSeconds: 42, createdAt: '2026-10-29T12:00:00Z' });
    assert.doesNotMatch(JSON.stringify(state), /never stored/);
  }
});

test('dismissal restores during pending vision and a late result cannot reactivate privacy', async () => {
  let finish!: (value: import('../src/core/types.ts').Clue[]) => void; let restores = 0; let actions = 0;
  const module = new OffTheMap({ capture: async () => 'data:image/jpeg;base64,AA==', analyze: () => new Promise((resolve) => { finish = resolve; }), privacy: async () => { actions++; }, restore: async () => { restores++; }, marker: async () => { actions++; } });
  const pending = module.sample(0); await new Promise<void>((resolve) => setImmediate(resolve));
  await module.dismiss();
  assert.equal(restores, 1);
  finish([{ category: 'storefront', severity: 5, confidence: 1 }, { category: 'transit', severity: 5, confidence: 1 }]);
  await pending;
  assert.equal(actions, 0); assert.equal(module.snapshot().privacyActive, false); assert.equal(module.snapshot().exposure.dismissed, true);
});

test('dismiss waits for a pending privacy RPC before restoration and cancels its following marker', async () => {
  let finishPrivacy!: () => void; let restores = 0; let markers = 0;
  const module = new OffTheMap({ capture: async () => 'data:image/jpeg;base64,AA==', analyze: async () => [{ category: 'storefront', severity: 5, confidence: 1 }, { category: 'transit', severity: 5, confidence: 1 }], privacy: () => new Promise<void>((resolve) => { finishPrivacy = resolve; }), restore: async () => { restores++; }, marker: async () => { markers++; } });
  const sample = module.sample(0); await new Promise<void>((resolve) => setImmediate(resolve));
  const dismiss = module.dismiss();
  assert.equal(restores, 0);
  finishPrivacy(); await Promise.all([sample, dismiss]);
  assert.equal(restores, 1); assert.equal(markers, 0); assert.equal(module.snapshot().privacyActive, false);
});
