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
      assert.equal(status.json().analysis, 'analysis unavailable');
      assert.deepEqual(status.json().connected, { twitch: false, obs: false, ai: false });
    } finally { await app.close(); }
  });
}
