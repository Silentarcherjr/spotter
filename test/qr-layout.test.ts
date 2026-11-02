import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareQrLayout } from '../src/obs/qr-layout.ts';
import type { SetupWire } from '../src/obs/setup.ts';
test('QR keepalive is covered by an independent opaque color and cannot be configured while streaming', async () => {
  const mutations: { name: string; args: Record<string, unknown> }[] = [];
  let live = true;
  let items: Record<string, unknown>[] = [];
  let hasColor = false;
  let badBlend = false;
  const wire = {
    async call(name: string, args: Record<string, unknown> = {}) {
      if (/^(Create|Set)/.test(name)) mutations.push({ name, args });
      if (name === 'GetSceneItemBlendMode')
        return { sceneItemBlendMode: badBlend ? 'OBS_BLEND_ADDITIVE' : 'OBS_BLEND_NORMAL' };
      if (name === 'GetSourceFilterList') return { filters: [] };
      if (name === 'GetVideoSettings') return { baseWidth: 1920, baseHeight: 1080 };
      if (name === 'GetSceneItemList')
        return { sceneItems: args.sceneName === 'Privacy' ? items : [] };
      if (name === 'GetInputSettings') {
        if (!hasColor) throw Object.assign(Error('missing'), { code: 600 });
        return {
          inputKind: 'color_source_v3',
          inputSettings: { color: 0xff20120c, width: 1920, height: 1080 },
        };
      }
      if (name === 'GetStreamStatus') return { outputActive: live };
      if (name === 'GetRecordStatus') return { outputActive: false };
      if (name === 'CreateSceneItem') {
        items.push({
          sourceName: 'Main',
          sceneItemId: 10,
          sceneItemIndex: 0,
          sceneItemEnabled: true,
        });
        return { sceneItemId: 10 };
      }
      if (name === 'CreateInput') {
        hasColor = true;
        items.push({
          sourceName: 'Spotter QR Privacy Backstop',
          sceneItemId: 11,
          sceneItemIndex: 1,
          sceneItemEnabled: true,
        });
        return { sceneItemId: 11 };
      }
      if (name === 'GetSceneItemTransform')
        return {
          sceneItemTransform: {
            positionX: 0,
            positionY: 0,
            alignment: 5,
            rotation: 0,
            boundsType: 'OBS_BOUNDS_STRETCH',
            boundsWidth: 1920,
            boundsHeight: 1080,
            cropTop: 0,
            cropBottom: 0,
            cropLeft: 0,
            cropRight: 0,
          },
        };
      return {};
    },
  } as unknown as SetupWire;
  await assert.rejects(prepareQrLayout(wire, 'Privacy'));
  assert.equal(mutations.length, 0);
  live = false;
  await prepareQrLayout(wire, 'Privacy');
  assert.ok(
    mutations.some(
      (c) =>
        c.name === 'SetSceneItemIndex' && c.args.sceneItemId === 10 && c.args.sceneItemIndex === 0,
    ),
  );
  assert.ok(
    mutations.some(
      (c) =>
        c.name === 'SetSceneItemIndex' && c.args.sceneItemId === 11 && c.args.sceneItemIndex === 1,
    ),
  );
  assert.ok(
    mutations.some(
      (c) =>
        c.name === 'CreateInput' &&
        (c.args.inputSettings as { color: number }).color >>> 24 === 255,
    ),
  );
  const n = mutations.length;
  await prepareQrLayout(wire, 'Privacy');
  assert.equal(mutations.length, n);
  live = true;
  badBlend = true;
  await assert.rejects(prepareQrLayout(wire, 'Privacy'));
  assert.equal(mutations.length, n);
});
