import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTelemetry, parseTake, elapsedTime } from '../src/presentation/telemetry.ts';

test('presentation hides correlations below20 genuine finite pairs and retains missing chat as missing', () => {
  const points = Array.from({ length: 20 }, (_, i) => ({ at: i * 1000, energy: 75 - i, chat: 20 - i / 2 }));
  assert.equal(summarizeTelemetry(points.slice(0, 19)).correlation, null);
  assert.equal(summarizeTelemetry(points).n, 20);
  assert.equal(summarizeTelemetry(points).correlation?.toFixed(2), '1.00');
  assert.equal(summarizeTelemetry(points.map(p => ({ ...p, chat: null }))).n, 0);
  assert.equal(summarizeTelemetry(points.map(p => ({ ...p, chat: 0 }))).correlation, null);
  assert.equal(elapsedTime(125000), '2:05');
});

test('recorded take parsing is allowlisted, ordered and never fabricates privacy or missing samples', () => {
  const take = parseTake({ rows: [
    { at: 2000, energy: 44, chat: 2, combinedAlert: true, exposure: 90, secret: 'never-copy' },
    { at: 1000, energy: 75, chat: 3 },
    { at: 3000, energy: null, chat: 1, privacyActive: true },
  ] }, 'test', 'Measured take');
  assert.deepEqual(take.points.map(p => p.at), [1000, 2000, 3000]);
  assert.equal(take.points[2]?.energy, null);
  assert.deepEqual(take.events.map(e => e.label), ['Combined alert', 'Privacy']);
  assert.doesNotMatch(JSON.stringify(take), /secret|never-copy|exposure/);
  const scoreOnly = parseTake({ rows: [{ at: 1, energy: 44, exposure: 90 }] }, 'test', 'Measured take');
  assert.equal(scoreOnly.events.length, 0);
  assert.equal(scoreOnly.points[0]?.chat, null);
});

test('real relay observations annotate received events without retaining channel identities', () => {
  const take = parseTake({ rows: [
    { at: 1000, instances: [{ energy: 44, tagout: { phase: 'raiding' } }] },
    { at: 2000, instances: [{ energy: 44, tagout: { phase: 'covered', homeId: 'private-id' } }] },
    { at: 3000, instances: [{ energy: 45, tagout: { phase: 'home' } }] },
  ] }, 'relay', 'Recorded relay');
  assert.deepEqual(take.events.map(e => e.label), ['Raid pending', 'Relay confirmed', 'Home confirmed']);
  assert.doesNotMatch(JSON.stringify(take), /private-id/);
});

test('private preview API requires a dashboard-specific header and never leaks into public payloads', async () => {
  const { createApp } = await import('../src/app.ts');
  const app = createApp({ databasePath: ':memory:', simulated: false });
  try {
    assert.equal((await app.inject('/api/private/frame')).statusCode, 403);
    const preview = await app.inject({ url: '/api/private/frame', headers: { 'x-spotter-preview': 'private-dashboard' } });
    assert.equal(preview.json(), null);
    assert.equal(preview.headers['cache-control'], 'no-store');
    for (const path of ['/api/status', '/api/report', '/api/overlay']) assert.doesNotMatch((await app.inject(path)).body, /data:image|lastPreview/);
    assert.equal((await app.inject('/api/review/takes/..%2F..%2F.env')).statusCode, 404);
  } finally { await app.close(); }
});

test('covering display names resolve via Twitch and cache without exposing a numeric fallback', async () => {
  const { TwitchRuntime } = await import('../src/twitch/runtime.ts');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const runtime = new TwitchRuntime(db, { clientId: 'test', clientSecret: 'test', redirectUri: 'http://localhost/callback' });
  let calls = 0;
  runtime.helix.users = async () => { calls++; return { data: [{ id: '123', login: 'display', display_name: 'ActualDisplayName' }] }; };
  assert.equal(await runtime.resolveDisplayName('123'), 'ActualDisplayName');
  assert.equal(await runtime.resolveDisplayName('123'), 'ActualDisplayName');
  assert.equal(calls, 1);
  runtime.helix.users = async () => { throw new Error('Unavailable'); };
  assert.equal(await runtime.resolveDisplayName('456'), null);
  db.close();
});

test('analyzed OBS frame reaches only the private memory endpoint and disappears on disconnect', async () => {
  const { createApp } = await import('../src/app.ts');
  const image = 'data:image/jpeg;base64,AA==';
  const app = createApp({ databasePath: ':memory:', simulated: false, qr: (await import('../src/core/qr.ts')).parseQrConfig({ QR_GUARD:'0' }),
    obs: { url: 'ws://127.0.0.1:4455', password: '', privacyScene: 'Privacy' },
    obsWire: { connect: async () => ({}), disconnect: async () => {}, on() {}, call: async (name: string) => name === 'GetCurrentProgramScene' ? { currentProgramSceneName: 'Main' } : { imageData: image } } as unknown as import('../src/obs/client.ts').ObsWire,
    ai: { key: 'test-only', model: 'fixture', fetcher: async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ clues: [{ category: 'transit', description: 'Transit identifier visible', severity: 1, confidence: .9 }] }) }] }] }), { status: 200 }) },
  });
  try {
    await app.ready(); let frame: { image: string } | null = null;
    for (let i = 0; i < 100 && !frame; i++) { await new Promise(resolve => setTimeout(resolve, 60)); frame = (await app.inject({ url: '/api/private/frame', headers: { 'x-spotter-preview': 'private-dashboard' } })).json(); }
    assert.equal(frame?.image, image);
    for (const path of ['/api/status', '/api/report', '/api/overlay']) assert.ok(!(await app.inject(path)).body.includes(image));
    await app.inject({ method: 'POST', url: '/api/obs/disconnect' });
    assert.equal((await app.inject({ url: '/api/private/frame', headers: { 'x-spotter-preview': 'private-dashboard' } })).json(), null);
  } finally { await app.close(); }
});
