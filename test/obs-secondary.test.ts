import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isolateSecondaryObs } from '../src/obs/secondary.ts';
import type { SetupWire } from '../src/obs/setup.ts';

test('secondary OBS gets a separate profile and collection without starting outputs or reading stream credentials', async () => {
  let profile = 'Original'; let collection = 'Original'; const profiles = ['Original']; const collections = ['Original']; const calls: string[] = [];
  const fake = { connect: async () => {}, disconnect: async () => {}, call: async (request: string, data: Record<string, string> = {}) => {
    calls.push(request);
    if (request === 'GetStreamStatus' || request === 'GetRecordStatus') return { outputActive: false };
    if (request === 'GetProfileList') return { currentProfileName: profile, profiles };
    if (request === 'GetSceneCollectionList') return { currentSceneCollectionName: collection, sceneCollections: collections };
    if (request === 'CreateProfile') { profiles.push(data.profileName!); profile = data.profileName!; return {}; }
    if (request === 'SetCurrentProfile') { profile = data.profileName!; return {}; }
    if (request === 'CreateSceneCollection') { collections.push(data.sceneCollectionName!); collection = data.sceneCollectionName!; return {}; }
    if (request === 'SetCurrentSceneCollection') { collection = data.sceneCollectionName!; return {}; }
    throw Error('Unexpected OBS call');
  } };
  const wire = fake as unknown as SetupWire;
  await isolateSecondaryObs('ws://127.0.0.1:4456', 'fake-password', wire);
  await isolateSecondaryObs('ws://127.0.0.1:4456', 'fake-password', wire);
  assert.equal(profile, 'Spotter - alredio'); assert.equal(collection, 'Spotter - alredio');
  assert.equal(profiles.length, 2); assert.equal(collections.length, 2);
  assert.ok(!calls.some(c => /Start|StreamService|Remove/.test(c)));
});

test('secondary isolation refuses to switch profiles while any output is active', async () => {
  const calls: string[] = [];
  const wire = { connect: async () => {}, disconnect: async () => {}, call: async (request: string) => { calls.push(request); return { outputActive: true }; } } as unknown as SetupWire;
  await assert.rejects(isolateSecondaryObs('ws://127.0.0.1:4456', 'fake-password', wire));
  assert.ok(!calls.some(c => /Create|Set/.test(c)));
});

test('secondary OBS isolation times out on a frozen request instead of hanging the setup', async () => {
  let disconnected = false;
  const wire = { connect: async () => {}, disconnect: async () => { disconnected = true; }, call: () => new Promise(() => {}) } as unknown as SetupWire;
  await assert.rejects(isolateSecondaryObs('ws://127.0.0.1:4456', 'fake-password', wire, 20), /timed out/);
  assert.equal(disconnected, true);
});
