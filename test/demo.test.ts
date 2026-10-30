import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoSession } from '../src/sim/session.ts';
import { createApp } from '../src/app.ts';

// Whole story, driven with deterministic virtual time; no network credentials.
test('demo combines exposure, low energy, moderation and click-approved raids with honest badges', () => {
  assert.throws(() => new DemoSession(false));
  const demo = new DemoSession(true);
  for (let tick = 0; tick < 12; tick++) demo.tick();
  let snapshot = demo.snapshot();
  assert.equal(snapshot.simulated, true);
  assert.equal(snapshot.exposure.active, true);
  assert.equal(snapshot.combinedAlert, true);
  assert.equal(snapshot.tagout.phase, 'suggested');
  assert.ok(snapshot.moderation.some((event) => event.action === 'flag' && event.simulated));
  assert.ok(snapshot.timeline.some((event) => event.actions.includes('privacy') && event.simulated));
  assert.ok(snapshot.events.every((event) => event.simulated));
  demo.approve();
  assert.equal(demo.snapshot().tagout.phase, 'raiding');
  demo.tick();
  assert.equal(demo.snapshot().tagout.phase, 'covered');
  demo.requestBack();
  assert.equal(demo.snapshot().tagout.phase, 'tag-back');
  demo.tick();
  assert.equal(demo.snapshot().tagout.phase, 'tag-back');
  demo.approve();
  demo.tick();
  assert.equal(demo.snapshot().tagout.phase, 'home');
  snapshot = demo.snapshot();
  assert.ok(snapshot.timeline.length <= 120);
  demo.dismiss();
  assert.equal(demo.snapshot().exposure.active, false);
});

test('demo cancellation is reversible and live mode rejects simulation controls', async () => {
  const demo = new DemoSession(true);
  for (let tick = 0; tick < 12; tick++) demo.tick();
  demo.approve();
  demo.cancel();
  assert.equal(demo.snapshot().tagout.phase, 'idle');
  const live = createApp({ databasePath: ':memory:', simulated: false });
  try { assert.equal((await live.inject({ method: 'POST', url: '/api/demo/approve' })).statusCode, 404); }
  finally { await live.close(); }
});

test('simulation API exposes public measurements only after explicit HUD opt-in', async () => {
  const app = createApp({ databasePath: ':memory:', simulated: true });
  try {
    const hidden = await app.inject('/api/overlay');
    assert.deepEqual(hidden.json(), { simulated: true, enabled: false });
    await app.inject({ method: 'POST', url: '/api/hud', payload: { enabled: true } });
    const visible = (await app.inject('/api/overlay')).json();
    assert.equal(visible.enabled, true);
    assert.equal(visible.simulated, true);
    assert.ok(!('exposure' in visible));
    assert.equal((await app.inject({ method: 'POST', url: '/api/hud', payload: { enabled: 'yes' } })).statusCode, 400);
  } finally { await app.close(); }
});

test('image folder simulation is gated, bounded and explicitly labelled', async () => {
  const { loadFrameFolder } = await import('../src/sim/frames.ts');
  await assert.rejects(loadFrameFolder(false, 'test/fixtures/frames'));
  const frames = await loadFrameFolder(true, 'test/fixtures/frames');
  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.simulated, true);
  assert.match(frames[0]?.image ?? '', /^data:image\/svg\+xml;base64,/);
});

test('demo report compares complete chat windows so the scripted decline is accurate', () => {
  const demo = new DemoSession(true);
  for (let tick = 0; tick < 12; tick++) demo.tick();
  const curves = demo.snapshot().curves;
  assert.equal(curves[0]?.chat, 20);
  assert.equal(curves.at(-1)?.chat, 12);
});

test('public HUD has a closed presentation payload without exposure clues scores or privacy state', async () => {
  const app = createApp({ databasePath: ':memory:', simulated: true });
  try {
    await app.inject({ method: 'POST', url: '/api/hud', payload: { enabled: true } });
    const hud = (await app.inject('/api/overlay')).json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(hud).toSorted(), ['coveringFor', 'enabled', 'energy', 'phase', 'rally', 'returning', 'simulated']);
    assert.doesNotMatch(JSON.stringify(hud), /exposure|clues|score|privacy|analysis/);
  } finally { await app.close(); }
});

test('manual relay request has a separate approval step in the explicit demo API', async () => {
  const app = createApp({ databasePath: ':memory:', simulated: true });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/demo/request' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().tagout.phase, 'suggested');
    assert.ok(!response.json().events.some((event: { kind: string }) => event.kind === 'start_raid'));
    assert.equal((await app.inject({ method: 'POST', url: '/api/demo/approve' })).json().tagout.phase, 'raiding');
  } finally { await app.close(); }
});

test('demo input script stays within measured-looking ranges without changing core scores', () => {
  const demo = new DemoSession(true);
  for (let i = 0; i < 32; i++) demo.tick();
  const s = demo.snapshot();
  assert.ok(Math.min(...s.curves.map(p => p.energy)) >= 40);
  assert.ok(Math.min(...s.curves.map(p => p.energy)) <= 45);
  assert.ok(Math.max(...s.timeline.map(p => p.score)) <= 90);
  assert.ok(new Set(s.curves.map(p => p.energy)).size >= 7);
  assert.equal(s.combinedAlert, true);
});

test('demo-only capture playback pauses virtual time and allows deterministic single steps', async () => {
  const app = createApp({ databasePath: ':memory:', simulated: true });
  try {
    await app.ready();
    assert.equal((await app.inject({ method: 'POST', url: '/api/demo/step' })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/api/demo/playback', payload: { paused: true } })).json().paused, true);
    const first = (await app.inject('/api/status')).json().step;
    assert.equal((await app.inject({ method: 'POST', url: '/api/demo/step' })).json().step, first + 1);
    assert.equal((await app.inject({ method: 'POST', url: '/api/demo/playback', payload: { paused: 'yes' } })).statusCode, 400);
    await app.inject({ method: 'POST', url: '/api/demo/request' }); await app.inject({ method: 'POST', url: '/api/demo/approve' }); await app.inject({ method: 'POST', url: '/api/demo/step' });
    await app.inject({ method: 'POST', url: '/api/hud', payload: { enabled: true } });
    assert.equal((await app.inject('/api/overlay')).json().coveringFor, 'Demo host');
  } finally { await app.close(); }
  const live = createApp({ databasePath: ':memory:', simulated: false });
  try { assert.equal((await live.inject({ method: 'POST', url: '/api/demo/playback', payload: { paused: true } })).statusCode, 404); }
  finally { await live.close(); }
});
