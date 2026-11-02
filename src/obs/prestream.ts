import type { SetupWire } from './setup.ts';
const captureKinds = new Set([
  'screen_capture',
  'display_capture',
  'window_capture',
  'monitor_capture',
  'game_capture',
  'xshm_input',
  'pipewire-desktop-capture-source',
  'syphon-input',
]);
export async function inspectPrestream(wire: SetupWire, qrEnabled: boolean) {
  const sceneList = await wire.call('GetSceneList');
  const scenes = new Set(sceneList.scenes.map((s) => String(s.sceneName)));
  const inputs = (await wire.call('GetInputList')).inputs;
  const kinds = new Map(inputs.map((i) => [String(i.inputName), String(i.inputKind)]));
  let unsafeCapture = false,
    privateBrowser = false;
  const visited = new Set<string>();
  async function visit(name: string, group = false): Promise<void> {
    if (visited.has(name)) return;
    visited.add(name);
    const items = group
      ? (await wire.call('GetGroupSceneItemList', { sceneName: name })).sceneItems
      : (await wire.call('GetSceneItemList', { sceneName: name })).sceneItems;
    for (const item of items) {
      if (!item.sceneItemEnabled) continue;
      const source = String(item.sourceName);
      if (item.isGroup === true) {
        await visit(source, true);
        continue;
      }
      if (scenes.has(source)) {
        await visit(source);
        continue;
      }
      const kind = kinds.get(source);
      if (kind && captureKinds.has(kind)) unsafeCapture = true;
      if (kind === 'browser_source') {
        const data = await wire.call('GetInputSettings', { inputName: source });
        const value = data.inputSettings.url;
        if (typeof value !== 'string') throw Error('Browser URL unavailable');
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          throw Error('Browser URL unavailable');
        }
        if (/^\/dashboard(?:\/|$)/i.test(url.pathname) || /^\/api(?:\/|$)/i.test(url.pathname))
          privateBrowser = true;
      }
    }
  }
  for (const scene of scenes) await visit(scene);
  const transition = await wire.call('GetCurrentSceneTransition');
  const special = await wire.call('GetSpecialInputs');
  let desktopAudio = false;
  for (const name of [special.desktop1, special.desktop2])
    if (name) {
      const mute = await wire.call('GetInputMute', { inputName: name });
      const volume = await wire.call('GetInputVolume', { inputName: name });
      if (!mute.inputMuted && volume.inputVolumeMul > 0) desktopAudio = true;
    }
  let delay = !qrEnabled;
  if (qrEnabled && scenes.has('Main')) {
    const filters = (await wire.call('GetSourceFilterList', { sourceName: 'Main' })).filters;
    delay = filters.some(
      (f) =>
        f.filterKind === 'gpu_delay' &&
        f.filterEnabled &&
        Number((f.filterSettings as { delay_ms?: number } | undefined)?.delay_ms) > 0,
    );
  }
  return {
    privacy: scenes.has('Privacy'),
    unsafeCapture,
    privateBrowser,
    desktopAudio,
    cut: transition.transitionKind === 'cut_transition',
    delay,
    qrEnabled,
    scene: sceneList.currentProgramSceneName,
  };
}
