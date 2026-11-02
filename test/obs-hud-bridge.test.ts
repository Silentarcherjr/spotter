import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureHudBridge, readBridgeImage } from '../src/obs/hud-bridge.ts';
import type { SetupWire } from '../src/obs/setup.ts';

function fake() {
  const inputs = new Set<string>();
  const items = new Map<string, { sourceName: string; sceneItemId: number }[]>([
    ['Main', []],
    ['Privacy', []],
  ]);
  const calls: { name: string; data: Record<string, any> }[] = [];
  let next = 1;
  const wire = {
    connect: async () => {},
    disconnect: async () => {},
    call: async (name: string, data: Record<string, any> = {}) => {
      calls.push({ name, data });
      if (name === 'GetVideoSettings') return { baseWidth: 1280, baseHeight: 720 };
      if (name === 'GetInputList')
        return {
          inputs: [...inputs].map((inputName) => ({
            inputName,
            inputKind: inputName.includes('Render') ? 'browser_source' : 'image_source',
          })),
        };
      if (name === 'GetSceneItemList') return { sceneItems: items.get(data.sceneName) };
      if (name === 'CreateInput') {
        inputs.add(data.inputName);
        const id = next++;
        items.get(data.sceneName)!.push({ sourceName: data.inputName, sceneItemId: id });
        return { sceneItemId: id };
      }
      if (name === 'CreateSceneItem') {
        const id = next++;
        items.get(data.sceneName)!.push({ sourceName: data.sourceName, sceneItemId: id });
        return { sceneItemId: id };
      }
      if (name === 'GetSourceScreenshot')
        return { imageData: 'data:image/png;base64,iVBORw0KGgo=' };
      return {};
    },
  };
  return { wire: wire as unknown as SetupWire, calls, inputs };
}

test('public HUD bridge renders only the receiver overlay off canvas and adds a transparent image to secondary scenes', async () => {
  const primary = fake();
  const secondary = fake();
  await configureHudBridge(primary.wire, secondary.wire, '/tmp/receiver-hud.png');
  await configureHudBridge(primary.wire, secondary.wire, '/tmp/receiver-hud.png');
  assert.equal(primary.inputs.size, 1);
  assert.equal(secondary.inputs.size, 1);
  const browser = primary.calls.find((c) => c.name === 'CreateInput')!;
  assert.equal(browser.data.sceneItemEnabled, false);
  assert.equal(browser.data.inputSettings.url, 'http://127.0.0.1:5174/overlay/?recorded=1');
  assert.ok(
    primary.calls
      .filter((c) => c.name === 'SetSceneItemTransform')
      .every((c) => c.data.sceneItemTransform.positionX < -1920),
  );
  assert.ok(
    ![...primary.calls, ...secondary.calls].some((c) =>
      /Start|StreamService|CurrentProgram/.test(c.name),
    ),
  );
  assert.ok((await readBridgeImage(primary.wire)).length > 0);
  assert.equal(primary.calls.at(-1)!.data.sourceName, 'Spotter Receiver HUD Render');
});
