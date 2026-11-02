import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareQrTransitions } from '../src/obs/qr-transitions.ts';
import type { SetupWire } from '../src/obs/setup.ts';
test('QR avoids mixed default/override transitions and never rewrites them during outputs', async () => {
  let live = true,
    kind = 'fade_transition';
  const overrides: Record<string, string | null> = { Main: null, Privacy: 'Cut' };
  const writes: string[] = [];
  const wire = {
    async call(n: string, a: Record<string, unknown> = {}) {
      if (n === 'GetSceneTransitionList')
        return {
          currentSceneTransitionKind: kind,
          transitions: [{ transitionName: 'Cut', transitionKind: 'cut_transition' }],
        };
      if (n === 'GetSceneSceneTransitionOverride')
        return { transitionName: overrides[String(a.sceneName)] };
      if (n === 'GetStreamStatus' || n === 'GetRecordStatus') return { outputActive: live };
      writes.push(n);
      if (n === 'SetCurrentSceneTransition') kind = 'cut_transition';
      if (n === 'SetSceneSceneTransitionOverride')
        overrides[String(a.sceneName)] = a.transitionName as null;
      return {};
    },
  } as unknown as SetupWire;
  await assert.rejects(prepareQrTransitions(wire, 'Privacy'));
  assert.equal(writes.length, 0);
  live = false;
  await prepareQrTransitions(wire, 'Privacy');
  assert.equal(kind, 'cut_transition');
  assert.deepEqual(overrides, { Main: null, Privacy: null });
  assert.equal(writes[0], 'SetCurrentSceneTransition');
  const count = writes.length;
  live = true;
  await prepareQrTransitions(wire, 'Privacy');
  assert.equal(writes.length, count);
});
test('explicit offline recovery round-trips Studio Mode and restores it; it is forbidden live', async () => {
  let enabled = false,
    live = true;
  const toggles: boolean[] = [];
  const wire = {
    async call(n: string, a: Record<string, unknown> = {}) {
      if (n === 'GetSceneTransitionList')
        return {
          currentSceneTransitionKind: 'cut_transition',
          transitions: [{ transitionName: 'Cut', transitionKind: 'cut_transition' }],
        };
      if (n === 'GetSceneSceneTransitionOverride') return { transitionName: null };
      if (n === 'GetStreamStatus' || n === 'GetRecordStatus') return { outputActive: live };
      if (n === 'GetCurrentPreviewScene') return { currentPreviewSceneName: 'Main' };
      if (n === 'SetCurrentPreviewScene') {
        assert.equal(a.sceneName, 'Main');
        return {};
      }
      if (n === 'GetStudioModeEnabled') return { studioModeEnabled: enabled };
      if (n === 'SetStudioModeEnabled') {
        enabled = a.studioModeEnabled === true;
        toggles.push(enabled);
        return {};
      }
      throw Error(n);
    },
  } as unknown as SetupWire;
  await assert.rejects(prepareQrTransitions(wire, 'Privacy', true));
  assert.deepEqual(toggles, []);
  live = false;
  await prepareQrTransitions(wire, 'Privacy', true);
  assert.deepEqual(toggles, [true, false]);
  assert.equal(enabled, false);
  enabled = true;
  toggles.length = 0;
  await prepareQrTransitions(wire, 'Privacy', true);
  assert.deepEqual(toggles, [false, true]);
  assert.equal(enabled, true);
});
