import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLocalCrew, crewEnvironment, linkLocalCrew } from '../scripts/crew-local-config.ts';

test('local crew setup persists one private secret and preserves existing peer files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spotter-crew-'));
  try {
    const first = await prepareLocalCrew(root);
    const second = await prepareLocalCrew(root);
    assert.equal(first.secret, second.secret);
    assert.match(first.secret, /^[a-f0-9]{64}$/);
    assert.equal((await stat(join(root, 'shared-secret'))).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(join(root, 'primary-crew.json'), 'utf8')), []);
    await linkLocalCrew(root, '100', '200');
    await prepareLocalCrew(root);
    assert.equal(JSON.parse(await readFile(join(root, 'primary-crew.json'), 'utf8'))[0].id, '200');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('secondary process isolates database ports OAuth and disables OBS AI without touching primary credentials', () => {
  const base = {
    PORT: '3210',
    VITE_PORT: '5173',
    DATABASE_PATH: 'data/spotter.sqlite',
    OBS_WEBSOCKET_PASSWORD: 'fake-obs',
    OPENAI_API_KEY: 'fake-ai',
    TWITCH_CLIENT_SECRET: 'fake-app',
    SIM: '1',
  };
  const secondary = crewEnvironment('secondary', base, '/tmp/private-crew', 'fake-shared');
  assert.equal(secondary.PORT, '3220');
  assert.equal(secondary.VITE_PORT, '5174');
  assert.equal(secondary.DATABASE_PATH, '/tmp/private-crew/secondary.sqlite');
  assert.equal(secondary.TWITCH_REDIRECT_URI, 'http://localhost:3220/api/twitch/callback');
  assert.equal(secondary.OBS_WEBSOCKET_PASSWORD, '');
  assert.equal(secondary.OPENAI_API_KEY, '');
  assert.equal(secondary.TWITCH_CLIENT_SECRET, 'fake-app');
  assert.equal(secondary.SIM, '0');
  assert.equal(base.OBS_WEBSOCKET_PASSWORD, 'fake-obs');
  const primary = crewEnvironment('primary', base, '/tmp/private-crew', 'fake-shared');
  assert.equal(primary.DATABASE_PATH, 'data/spotter.sqlite');
  assert.equal(primary.OBS_WEBSOCKET_PASSWORD, 'fake-obs');
});

test('linking crew uses numeric distinct identities and reciprocal authenticated loopback endpoints', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spotter-link-'));
  try {
    await assert.rejects(linkLocalCrew(root, '100', '100'));
    await assert.rejects(linkLocalCrew(root, 'name', '200'));
    await linkLocalCrew(root, '100', '200');
    const primary = JSON.parse(await readFile(join(root, 'primary-crew.json'), 'utf8'));
    const secondary = JSON.parse(await readFile(join(root, 'secondary-crew.json'), 'utf8'));
    assert.equal(primary[0].endpoint, 'http://127.0.0.1:3220/api/crew/status');
    assert.equal(secondary[0].endpoint, 'http://127.0.0.1:3210/api/crew/status');
    assert.equal(primary[0].token, secondary[0].token);
    assert.equal(secondary[0].id, '100');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
