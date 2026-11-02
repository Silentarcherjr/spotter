import { prepareQrTransitions } from './qr-transitions.ts';
import OBSWebSocket from 'obs-websocket-js';
import { randomUUID } from 'node:crypto';
import type { SetupWire } from './setup.ts';
export interface ProgramRecordState {
  profile: string;
  localProfile: string;
  scene: string;
  directory: string;
  video: {
    baseWidth: number;
    baseHeight: number;
    outputWidth: number;
    outputHeight: number;
    fpsNumerator: number;
    fpsDenominator: number;
  };
  mutes: { name: string; muted: boolean }[];
}
async function mutes(wire: SetupWire) {
  const rows: { name: string; muted: boolean }[] = [];
  for (const input of (await wire.call('GetInputList')).inputs) {
    if (typeof input.inputName !== 'string') continue;
    try {
      rows.push({
        name: input.inputName,
        muted: (await wire.call('GetInputMute', { inputName: input.inputName })).inputMuted,
      });
    } catch (e) {
      if (!(e && typeof e === 'object' && 'code' in e && e.code === 604)) throw e;
    }
  }
  return rows;
}
/** Record only known synthetic program output, offline, silent, under a blank profile. No screenshot render is used as proof. */
export async function recordQrProgram<T>(
  url: string,
  password: string,
  directory: string,
  run: () => Promise<T>,
  wire: SetupWire = new OBSWebSocket(),
  persist?: (s: ProgramRecordState) => Promise<void>,
): Promise<{ path: string; result: T }> {
  if (new URL(url).port !== '4455') throw Error('Primary offline proof only');
  await wire.connect(url, password);
  let saved: ProgramRecordState | undefined,
    changed = false,
    started = false,
    path = '';
  let result!: T;
  try {
    if (
      (await wire.call('GetStreamStatus')).outputActive ||
      (await wire.call('GetRecordStatus')).outputActive
    )
      throw Error('Outputs must be stopped');
    const items = (await wire.call('GetSceneItemList', { sceneName: 'Main' })).sceneItems;
    if (
      items.some(
        (i) =>
          i.sceneItemEnabled && !['Spotter IRL', 'Spotter Overlay'].includes(String(i.sourceName)),
      )
    )
      throw Error('Unexpected public program source');
    const media = await wire.call('GetInputSettings', { inputName: 'Spotter IRL' });
    if (
      media.inputKind !== 'ffmpeg_source' ||
      typeof media.inputSettings.local_file !== 'string' ||
      !media.inputSettings.local_file.endsWith('/data/takes/qr-guard/motion-loop.mp4')
    )
      throw Error('Known TEST-ONLY input required');
    saved = {
      profile: (await wire.call('GetProfileList')).currentProfileName,
      localProfile: `Spotter QR OUTPUT ONLY ${randomUUID().slice(0, 8)}`,
      scene: (await wire.call('GetCurrentProgramScene')).currentProgramSceneName,
      directory: (await wire.call('GetRecordDirectory')).recordDirectory,
      video: await wire.call('GetVideoSettings'),
      mutes: await mutes(wire),
    };
    await persist?.(saved);
    changed = true;
    await wire.call('CreateProfile', { profileName: saved.localProfile });
    let found = false;
    for (let i = 0; i < 40; i++) {
      if ((await wire.call('GetProfileList')).profiles.includes(saved.localProfile)) {
        found = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!found) throw Error('Blank profile unavailable');
    await wire.call('SetCurrentProfile', { profileName: saved.localProfile });
    if ((await wire.call('GetProfileList')).currentProfileName !== saved.localProfile)
      throw Error('Blank profile not selected');
    await wire.call('SetVideoSettings', saved.video);
    await wire.call('SetRecordDirectory', { recordDirectory: directory });
    for (const i of await mutes(wire))
      await wire.call('SetInputMute', { inputName: i.name, inputMuted: true });
    await prepareQrTransitions(wire, 'Privacy', true);
    await wire.call('SetCurrentProgramScene', { sceneName: 'Main' });
    await wire.call('TriggerMediaInputAction', {
      inputName: 'Spotter IRL',
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
    });
    if ((await mutes(wire)).some((i) => !i.muted)) throw Error('Silent inputs required');
    await wire.call('StartRecord');
    started = true;
    result = await run();
  } finally {
    try {
      if (started) {
        path = (await wire.call('StopRecord')).outputPath;
        let inactive = false;
        for (let i = 0; i < 100; i++) {
          if (!(await wire.call('GetRecordStatus')).outputActive) {
            inactive = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 50));
        }
        if (!inactive) throw Error('Recording shutdown pending; profile retained');
      }
      if (changed && saved) {
        await wire.call('SetCurrentProfile', { profileName: saved.profile });
        await wire.call('SetVideoSettings', saved.video);
        await wire.call('SetRecordDirectory', { recordDirectory: saved.directory });
        await wire.call('SetCurrentProgramScene', { sceneName: saved.scene });
        for (const i of saved.mutes) {
          try {
            await wire.call('SetInputMute', { inputName: i.name, inputMuted: i.muted });
          } catch (e) {
            if (!(e && typeof e === 'object' && 'code' in e && e.code === 600)) throw e;
          }
        }
        await wire.call('RemoveProfile', { profileName: saved.localProfile });
      }
    } finally {
      await wire.disconnect().catch(() => {});
    }
  }
  return { path, result };
}
