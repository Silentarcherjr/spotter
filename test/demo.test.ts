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
  assert.ok(snapshot.moderation.some((event) => event.action === 'delete' && event.simulated));
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
