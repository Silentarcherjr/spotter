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

test('OBS captures 768px JPEG, restores exact prior scene and survives closed OBS', async () => {
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
  assert.deepEqual(calls.find((call) => call.request === 'GetSourceScreenshot')?.data, { sourceName: 'Main', imageFormat: 'jpg', imageWidth: 768 });
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
