import OBSWebSocket from 'obs-websocket-js';
import type { OBSRequestTypes, OBSResponseTypes } from 'obs-websocket-js';

export type SetupWire = Pick<OBSWebSocket, 'connect' | 'disconnect' | 'call'>;
export const obsSetupNames = {
  main: 'Main',
  scene: 'Privacy',
  media: 'Spotter IRL',
  overlay: 'Spotter Overlay',
  privacy: 'Spotter Privacy',
} as const;
interface Options {
  url: string;
  password: string;
  videoPath: string;
  webOrigin: string;
}

function diagnosticCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && Number.isInteger(error.code)
    ? ` (code ${error.code})`
    : '';
}

async function limit<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 8000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Reconciles only named Spotter sources; never starts outputs or switches program. */
export async function setupObs(options: Options, wire: SetupWire = new OBSWebSocket()) {
  const origin = new URL(options.webOrigin);
  if (
    origin.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(origin.hostname) ||
    origin.username ||
    origin.password
  )
    throw new Error('Use a local Spotter web origin');
  const browser = (path: string) => ({
    url: new URL(path, origin).href,
    width: 1920,
    height: 1080,
    reroute_audio: false,
    shutdown: false,
  });
  const definitions = [
    {
      name: obsSetupNames.media,
      kind: 'ffmpeg_source',
      scenes: [obsSetupNames.main],
      settings: {
        is_local_file: true,
        local_file: options.videoPath,
        looping: true,
        restart_on_activate: true,
        clear_on_media_end: false,
      },
    },
    {
      name: obsSetupNames.privacy,
      kind: 'browser_source',
      scenes: [obsSetupNames.scene],
      settings: browser('/privacy/'),
    },
    {
      name: obsSetupNames.overlay,
      kind: 'browser_source',
      scenes: [obsSetupNames.main, obsSetupNames.scene],
      settings: browser('/overlay/?recorded=1'),
    },
  ];
  let createdScenes = 0;
  let createdInputs = 0;
  let createdSceneItems = 0;
  async function call<T extends keyof OBSRequestTypes>(
    request: T,
    data?: OBSRequestTypes[T],
  ): Promise<OBSResponseTypes[T]> {
    try {
      return await limit(wire.call(request, data), `OBS request timed out: ${request}`);
    } catch (error) {
      const code = diagnosticCode(error);
      throw new Error(`OBS setup request failed: ${request}${code}`);
    }
  }
  try {
    try {
      await limit(wire.connect(options.url, options.password), 'OBS connection unavailable');
    } catch (error) {
      throw new Error(
        `OBS connection unavailable${diagnosticCode(error)}; check WebSocket server, URL and password in .env`,
      );
    }
    const { inputKinds } = await call('GetInputKindList', { unversioned: true });
    for (const kind of ['ffmpeg_source', 'browser_source'])
      if (!inputKinds.includes(kind)) throw new Error(`OBS is missing input support: ${kind}`);
    const { inputs } = await call('GetInputList');
    for (const definition of definitions) {
      const existing = inputs.find((input) => input.inputName === definition.name);
      if (
        existing &&
        existing.inputKind !== definition.kind &&
        existing.unversionedInputKind !== definition.kind
      )
        throw new Error(`OBS incompatible input: ${definition.name}; rename it before retrying`);
    }
    const { baseWidth, baseHeight } = await call('GetVideoSettings');
    if (!(baseWidth > 0 && baseHeight > 0)) throw new Error('OBS canvas dimensions unavailable');
    const { scenes } = await call('GetSceneList');
    for (const sceneName of [obsSetupNames.main, obsSetupNames.scene]) {
      if (!scenes.some((scene) => scene.sceneName === sceneName)) {
        await call('CreateScene', { sceneName });
        createdScenes++;
      }
    }
    for (const definition of definitions) {
      if (!inputs.some((input) => input.inputName === definition.name)) {
        await call('CreateInput', {
          sceneName: definition.scenes[0]!,
          inputName: definition.name,
          inputKind: definition.kind,
          inputSettings: definition.settings,
          sceneItemEnabled: true,
        });
        createdInputs++;
        createdSceneItems++;
      } else {
        const { inputSettings } = await call('GetInputSettings', { inputName: definition.name });
        if (
          Object.entries(definition.settings).some(([key, value]) => inputSettings[key] !== value)
        )
          await call('SetInputSettings', {
            inputName: definition.name,
            inputSettings: definition.settings,
            overlay: true,
          });
      }
      for (const sceneName of definition.scenes) {
        const { sceneItems } = await call('GetSceneItemList', { sceneName });
        const matches = sceneItems.filter((item) => item.sourceName === definition.name);
        if (matches.length > 1)
          throw new Error(
            `OBS duplicate scene items: ${definition.name} in ${sceneName}; remove duplicates before retrying`,
          );
        let sceneItemId = matches[0]?.sceneItemId as number | undefined;
        if (sceneItemId === undefined) {
          sceneItemId = (
            await call('CreateSceneItem', {
              sceneName,
              sourceName: definition.name,
              sceneItemEnabled: true,
            })
          ).sceneItemId;
          createdSceneItems++;
        }
        await call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: true });
        await call('SetSceneItemTransform', {
          sceneName,
          sceneItemId,
          sceneItemTransform: {
            positionX: 0,
            positionY: 0,
            rotation: 0,
            alignment: 5,
            scaleX: 1,
            scaleY: 1,
            cropTop: 0,
            cropBottom: 0,
            cropLeft: 0,
            cropRight: 0,
            boundsType:
              definition.kind === 'browser_source'
                ? 'OBS_BOUNDS_STRETCH'
                : 'OBS_BOUNDS_SCALE_INNER',
            boundsAlignment: 0,
            boundsWidth: baseWidth,
            boundsHeight: baseHeight,
          },
        });
        // Keep existing user sources, but cover them with the opaque privacy screen.
        const index =
          definition.name === obsSetupNames.media
            ? 0
            : (await call('GetSceneItemList', { sceneName })).sceneItems.length - 1;
        await call('SetSceneItemIndex', { sceneName, sceneItemId, sceneItemIndex: index });
      }
    }
    const verifiedScenes = await call('GetSceneList');
    for (const sceneName of [obsSetupNames.main, obsSetupNames.scene]) {
      if (!verifiedScenes.scenes.some((scene) => scene.sceneName === sceneName))
        throw new Error('OBS scene verification failed');
      const { sceneItems } = await call('GetSceneItemList', { sceneName });
      for (const definition of definitions.filter((item) =>
        item.scenes.some((name) => name === sceneName),
      )) {
        const matches = sceneItems.filter((item) => item.sourceName === definition.name);
        if (matches.length !== 1 || !matches[0]!.sceneItemEnabled)
          throw new Error('OBS scene-item verification failed');
      }
    }
    for (const definition of definitions) {
      const { inputSettings } = await call('GetInputSettings', { inputName: definition.name });
      for (const [key, value] of Object.entries(definition.settings))
        if (inputSettings[key] !== value)
          throw new Error(`OBS input verification failed: ${definition.name}`);
    }
    return {
      createdScenes,
      createdInputs,
      createdSceneItems,
      scenes: [obsSetupNames.main, obsSetupNames.scene],
      sources: [obsSetupNames.media, obsSetupNames.privacy, obsSetupNames.overlay],
      canvas: { width: baseWidth, height: baseHeight },
    };
  } finally {
    await limit(wire.disconnect(), 'OBS disconnect timeout').catch(() => {});
  }
}
