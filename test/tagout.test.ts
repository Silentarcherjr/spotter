import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { TagOut } from '../src/modules/tagout/runtime.ts';
import { parseCrewConfig, pollCrew } from '../src/modules/tagout/crew.ts';

test('crew polling is private, loopback-only, token authenticated and excludes missing data', async () => {
  assert.throws(() => parseCrewConfig([{ id: 'partner', endpoint: 'https://public.example/api/crew/status', token: 'fake-token' }]));
  const crew = parseCrewConfig([{ id: 'partner', endpoint: 'http://127.0.0.1:3220/api/crew/status', token: 'fake-token' }]);
  const result = await pollCrew(crew, async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fake-token');
    return new Response(JSON.stringify({ live: true, energy: 90 }));
  });
  assert.deepEqual(result, [{ id: 'partner', live: true, energy: 90 }]);
  const missing = await pollCrew(crew, async () => { throw new Error('offline'); });
  assert.deepEqual(missing, []);
});

test('live relay never raids without approval, rechecks live status and persists attempt limits', async () => {
  const db = new DatabaseSync(':memory:');
  let starts = 0;
  let targetLive = true;
  const context = { broadcasterId: 'main', tokenOwnerId: 'main', sourceLive: true };
  const module = new TagOut(db, {
    identity: () => context,
    live: async (id: string) => id === 'main' || targetLive,
    start: async () => { starts++; }, cancel: async () => {},
  });
  const crew = [{ id: 'partner', live: true, energy: 90 }];
  try {
    module.update(20, crew, 0); module.update(20, crew, 121_000);
    assert.equal(module.snapshot(121_000).tagout.phase, 'suggested');
    assert.equal(starts, 0);
    targetLive = false;
    await module.approve(122_000); assert.equal(starts, 0);
    targetLive = true;
    await module.approve(123_000); assert.equal(starts, 1);
    assert.equal(module.snapshot(123_000).tagout.phase, 'raiding');
    await module.approve(123_001); assert.equal(starts, 1);
    module.confirm('main', 'partner', 124_000);
    assert.equal(module.snapshot(124_000).tagout.phase, 'covered');
    module.requestBack(125_000);
    await module.approve(126_000); assert.equal(starts, 1);
    await module.cancel(127_000);
    assert.equal(module.snapshot(127_000).tagout.phase, 'covered');
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM raid_attempts').get() as { n: number }).n, 1);
  } finally { db.close(); }
});

test('an uncertain raid response requires cancellation; it cannot auto retry or claim covered', async () => {
  const db = new DatabaseSync(':memory:');
  const module = new TagOut(db, { identity: () => ({ broadcasterId: 'main', tokenOwnerId: 'main', sourceLive: true }), live: async () => true, start: async () => { throw new Error('timeout'); }, cancel: async () => {} });
  try {
    const crew = [{ id: 'partner', live: true, energy: 90 }];
    module.update(20, crew, 0); module.update(20, crew, 121_000);
    await module.approve(122_000);
    assert.equal(module.snapshot(122_000).tagout.phase, 'confirming');
    assert.equal(module.snapshot(122_000).status, 'Raid response unavailable; verify Twitch or cancel');
    await module.cancel(123_000);
    assert.equal(module.snapshot(123_000).tagout.phase, 'idle');
  } finally { db.close(); }
});

test('relay state and rate-limit attempts survive restart and cannot cross broadcaster identities', async () => {
  const db = new DatabaseSync(':memory:');
  let identity = { broadcasterId: 'main', tokenOwnerId: 'main', sourceLive: true };
  const deps = { identity: () => identity, live: async () => true, start: async () => {}, cancel: async () => {} };
  try {
    const module = new TagOut(db, deps);
    const crew = [{ id: 'partner', live: true, energy: 90 }];
    module.update(20, crew, 0); module.update(20, crew, 121_000); await module.approve(122_000);
    const restored = new TagOut(db, deps);
    assert.equal(restored.snapshot(123_000).tagout.phase, 'raiding');
    assert.equal(restored.snapshot(123_000).countdownSeconds, 89);
    identity = { broadcasterId: 'other', tokenOwnerId: 'other', sourceLive: true };
    assert.equal(restored.snapshot(123_000).tagout.phase, 'idle');
    identity = { broadcasterId: 'main', tokenOwnerId: 'main', sourceLive: true };
    assert.equal(restored.snapshot(123_000).tagout.phase, 'raiding');
  } finally { db.close(); }
});

test('crew status requires a shared secret and shares only energy/live fields', async () => {
  const { createApp } = await import('../src/app.ts');
  const app = createApp({ databasePath: ':memory:', simulated: false, crewToken: 'fake-peer-secret' });
  try {
    assert.equal((await app.inject('/api/crew/status')).statusCode, 401);
    const response = await app.inject({ url: '/api/crew/status', headers: { Authorization: 'Bearer fake-peer-secret' } });
    assert.deepEqual(response.json(), { live: null, energy: null });
  } finally { await app.close(); }
});
