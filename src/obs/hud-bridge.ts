import OBSWebSocket from 'obs-websocket-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { SetupWire } from './setup.ts';
const renderName = 'Spotter Receiver HUD Render';
const imageName = 'Spotter Relay HUD Bridge';

export async function configureHudBridge(primary: SetupWire, secondary: SetupWire, imagePath: string): Promise<void> {
  for (const [wire, inputName, kind, settings, hidden] of [
    [primary, renderName, 'browser_source', { url: 'http://127.0.0.1:5174/overlay/?recorded=1', is_local_file: false, width: 1920, height: 1080, shutdown: false, css: 'body { background: transparent; margin: 0; overflow: hidden; }' }, true],
    [secondary, imageName, 'image_source', { file: imagePath, unload: false }, false],
  ] as const) {
    const { inputs } = await wire.call('GetInputList');
    const existing = inputs.find(input => input.inputName === inputName);
    if (existing && existing.inputKind !== kind && existing.unversionedInputKind !== kind) throw new Error('Incompatible HUD bridge source');
    if (!existing) await wire.call('CreateInput', { sceneName: 'Main', inputName, inputKind: kind, inputSettings: settings, sceneItemEnabled: false });
    else await wire.call('SetInputSettings', { inputName, inputSettings: settings, overlay: true });
    const { baseWidth, baseHeight } = await wire.call('GetVideoSettings');
    for (const sceneName of ['Main', 'Privacy']) {
      const { sceneItems } = await wire.call('GetSceneItemList', { sceneName });
      const found = sceneItems.filter(item => item.sourceName === inputName);
      if (found.length > 1) throw new Error('Duplicate HUD bridge source');
      const sceneItemId = found[0]?.sceneItemId as number | undefined ?? (await wire.call('CreateSceneItem', { sceneName, sourceName: inputName, sceneItemEnabled: false })).sceneItemId;
      await wire.call('SetSceneItemTransform', { sceneName, sceneItemId, sceneItemTransform: { positionX: hidden ? -4000 : 0, positionY: hidden ? -4000 : 0, scaleX: 1, scaleY: 1, rotation: 0, alignment: 5, boundsType: 'OBS_BOUNDS_STRETCH', boundsWidth: baseWidth, boundsHeight: baseHeight } });
      await wire.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: true });
      if (!hidden) await wire.call('SetSceneItemIndex', { sceneName, sceneItemId, sceneItemIndex: (await wire.call('GetSceneItemList', { sceneName })).sceneItems.length - 1 });
    }
  }
}
export async function readBridgeImage(primary: SetupWire): Promise<Buffer> {
  const image = await primary.call('GetSourceScreenshot', { sourceName: renderName, imageFormat: 'png', imageWidth: 1920 });
  if (!image.imageData.startsWith('data:image/png;base64,')) throw new Error('Invalid public HUD image');
  return Buffer.from(image.imageData.slice('data:image/png;base64,'.length), 'base64');
}
export async function runHudBridge(password: string, seconds = 1800): Promise<void> {
  const primary = new OBSWebSocket(); const secondary = new OBSWebSocket();
  const imagePath = resolve('data/crew/receiver-hud-live.png');
  await mkdir(dirname(imagePath), { recursive: true, mode: 0o700 });
  try {
    await primary.connect('ws://127.0.0.1:4455', password);
    await secondary.connect('ws://127.0.0.1:4456', password);
    await configureHudBridge(primary, secondary, imagePath);
    const began = Date.now(); let count = 0;
    console.log('Public receiver HUD bridge running; primary render is off canvas. No stream outputs or private vision frames captured.');
    while (Date.now() - began < seconds * 1000) {
      const image = await readBridgeImage(primary);
      await writeFile(imagePath, image, { mode: 0o600 });
      await secondary.call('SetInputSettings', { inputName: imageName, inputSettings: { file: imagePath }, overlay: true });
      count++; if (count === 5) console.log('Five actual receiver overlay frames delivered to secondary OBS.');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } finally { await primary.disconnect().catch(() => {}); await secondary.disconnect().catch(() => {}); }
}

/** Disable only the temporary bridge sources; leave OBS outputs and original sources alone. */
export async function disableHudBridge(password: string): Promise<void> {
  for (const [url, sourceName] of [['ws://127.0.0.1:4455', renderName], ['ws://127.0.0.1:4456', imageName]]) {
    const wire = new OBSWebSocket();
    try {
      await wire.connect(url, password);
      for (const sceneName of ['Main', 'Privacy']) {
        const { sceneItems } = await wire.call('GetSceneItemList', { sceneName });
        for (const item of sceneItems.filter(item => item.sourceName === sourceName)) await wire.call('SetSceneItemEnabled', { sceneName, sceneItemId: item.sceneItemId as number, sceneItemEnabled: false });
      }
    } finally { await wire.disconnect().catch(() => {}); }
  }
}
