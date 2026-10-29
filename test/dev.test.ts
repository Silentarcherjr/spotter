import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

// Regression: Node's --watch crashed with EMFILE before the local pages opened.
test('development command boots all pages and stops both processes', { timeout: 20_000 }, async () => {
  const child = spawn(process.execPath, ['scripts/dev.mjs'], {
    env: { ...process.env, PORT: '3219', VITE_PORT: '5189', SIM: '0', DATABASE_PATH: ':memory:' },
    stdio: 'pipe',
  });
  let output = '';
  child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
  child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
  const exited = once(child, 'exit');
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      assert.equal(child.exitCode, null, output);
      try {
        const response = await fetch('http://127.0.0.1:5189/api/health');
        if (response.ok) { ready = true; break; }
      } catch { /* Wait for startup. */ }
      await delay(100);
    }
    assert.ok(ready, output);
    for (const page of ['dashboard', 'overlay', 'sensor']) {
      const response = await fetch(`http://127.0.0.1:5189/${page}/`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Spotter/);
    }
  } finally {
    child.kill('SIGTERM');
    await exited;
  }
});
