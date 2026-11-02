import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';

for (const simulated of [false, true]) {
  test(`local API exposes health and explicit simulation=${simulated}`, async () => {
    const app = createApp({ databasePath: ':memory:', simulated });
    try {
      const health = await app.inject('/api/health');
      assert.equal(health.statusCode, 200);
      assert.deepEqual(health.json(), { status: 'ok', simulated });
      const status = await app.inject('/api/status');
      assert.equal(status.json().simulated, simulated);
      assert.equal(status.json().analysis, simulated ? 'available' : 'analysis unavailable');
      if (!simulated)
        assert.deepEqual(status.json().connected, { twitch: false, obs: false, ai: false });
    } finally {
      await app.close();
    }
  });
}

test('private API rejects foreign hosts/origins and reports the actual HUD opt-in state', async () => {
  const app = createApp({ databasePath: ':memory:', simulated: true });
  try {
    assert.equal(
      (await app.inject({ url: '/api/status', headers: { host: 'foreign.example' } })).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/hud',
          headers: { origin: 'https://foreign.example' },
          payload: { enabled: true },
        })
      ).statusCode,
      403,
    );
    assert.equal((await app.inject('/api/status')).json().hudEnabled, false);
    await app.inject({ method: 'POST', url: '/api/hud', payload: { enabled: true } });
    assert.equal((await app.inject('/api/status')).json().hudEnabled, true);
  } finally {
    await app.close();
  }
});

test('local OBS disconnect/reconnect controls preserve API health without stopping outputs', async () => {
  let disconnects = 0;
  let connects = 0;
  const wire = {
    on() {},
    async connect() {
      connects++;
    },
    async disconnect() {
      disconnects++;
    },
    async call() {
      throw new Error('No output or capture calls expected');
    },
  };
  const app = createApp({
    databasePath: ':memory:',
    simulated: false,
    obs: { url: 'ws://127.0.0.1:4455', password: 'fake', privacyScene: 'Privacy' },
    obsWire: wire as unknown as import('../src/obs/client.ts').ObsWire,
  });
  try {
    await app.ready();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal((await app.inject('/api/status')).json().connected.obs, true);
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/obs/disconnect' })).statusCode,
      200,
    );
    assert.equal((await app.inject('/api/status')).json().connected.obs, false);
    assert.equal((await app.inject('/api/health')).statusCode, 200);
    await app.inject({ method: 'POST', url: '/api/obs/reconnect' });
    assert.equal((await app.inject('/api/status')).json().connected.obs, true);
    assert.equal(connects, 2);
    assert.equal(disconnects, 1);
  } finally {
    await app.close();
  }
});
