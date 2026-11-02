import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { readQrProofState } from '../src/obs/qr-proof-state.ts';
import type { SetupWire } from '../src/obs/setup.ts';
test('QR output diagnostic is read-only and projects no image or raw settings', async () => {
  const sentinel = 'TEST-ONLY-NOT-A-REAL-SECRET';
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  const calls: string[] = [];
  const wire = {
    async connect() {},
    async disconnect() {},
    async call(name: string) {
      calls.push(name);
      switch (name) {
        case 'GetInputSettings':
          return {
            inputSettings: {
              local_file: '/private/data/takes/qr-guard/motion-loop.mp4',
              unrelated: sentinel,
            },
          };
        case 'GetSceneItemList':
          return { sceneItems: [{ sourceName: 'Camera', sceneItemEnabled: true }] };
        case 'GetSourceFilter':
          return { filterEnabled: true, filterSettings: { delay_ms: 500 } };
        case 'GetSourceScreenshot':
          return { imageData: 'data:image/png;base64,' + PNG.sync.write(png).toString('base64') };
        case 'GetCurrentProgramScene':
          return { currentProgramSceneName: 'Main' };
        case 'GetMediaInputStatus':
          return { mediaCursor: 123 };
        default:
          throw Error('Unexpected OBS call');
      }
    },
  } as unknown as SetupWire;
  const state = await readQrProofState('ws://fake', '', 'Camera', wire);
  assert.equal(state.opaquePixels, 4);
  assert.equal(state.testInput, true);
  assert.equal(state.mainDelayMs, 500);
  assert.ok(calls.every((c) => c.startsWith('Get')));
  assert.ok(!JSON.stringify(state).includes(sentinel));
  assert.ok(!JSON.stringify(state).includes('data:image'));
});
test('OBS output safety status never reads stream-service settings and detects an evidence source', async () => {
  const { qrOutputStatus } = await import('../src/obs/qr-proof-state.ts');
  const calls: string[] = [];
  const wire = {
    async connect() {},
    async disconnect() {},
    async call(name: string) {
      calls.push(name);
      if (name === 'GetProfileList') return { currentProfileName: 'Local test' };
      if (name === 'GetStreamStatus') return { outputActive: false };
      if (name === 'GetRecordStatus') return { outputActive: false };
      if (name === 'GetCurrentProgramScene') return { currentProgramSceneName: 'Main' };
      if (name === 'GetSceneItemList')
        return { sceneItems: [{ sourceName: 'Spotter QR Evidence Window' }] };
      throw Error('Unexpected request');
    },
  } as unknown as SetupWire;
  const status = await qrOutputStatus('ws://localhost:4456', '', wire);
  assert.equal(status.streaming, false);
  assert.equal(status.recording, false);
  assert.equal(status.mainContainsEvidence, true);
  assert.ok(!calls.includes('GetStreamServiceSettings'));
});
