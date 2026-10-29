import OBSWebSocket from 'obs-websocket-js';

/** Read only allowlisted state; never request stream service settings or stream keys. */
export async function readObsProof(url: string, password: string, captureMetadata = false) {
  const wire = new OBSWebSocket();
  try {
    await wire.connect(url, password);
    const scene = await wire.call('GetCurrentProgramScene');
    const stream = await wire.call('GetStreamStatus');
    const main = await wire.call('GetSceneItemList', { sceneName: 'Main' });
    const media = await wire.call('GetMediaInputStatus', { inputName: 'Spotter IRL' });
    let capture: { mime: string; encodedLength: number } | undefined;
    if (captureMetadata) {
      const frame = await wire.call('GetSourceScreenshot', { sourceName: 'Spotter IRL', imageFormat: 'jpg', imageWidth: 1280 });
      capture = { mime: /^data:([^;,]+)/.exec(frame.imageData)?.[1] ?? 'unknown', encodedLength: frame.imageData.length };
    }
    return { capture, scene: scene.currentProgramSceneName, streaming: stream.outputActive, mediaState: media.mediaState, mediaCursorMs: media.mediaCursor, mediaDurationMs: media.mediaDuration, mainSources: main.sceneItems.map((item) => ({ name: item.sourceName, enabled: item.sceneItemEnabled })) };
  } finally { await wire.disconnect().catch(() => {}); }
}

/** Reversible media-only cue for the prerecorded demo; does not affect stream outputs. */
export async function cueObsClip(url: string, password: string, resume: boolean, mediaCursor = 10000) {
  const wire = new OBSWebSocket();
  try {
    await wire.connect(url, password);
    if (!resume) {
      await wire.call('TriggerMediaInputAction', { inputName: 'Spotter IRL', mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE' });
      await wire.call('SetMediaInputCursor', { inputName: 'Spotter IRL', mediaCursor });
    } else await wire.call('TriggerMediaInputAction', { inputName: 'Spotter IRL', mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY' });
  } finally { await wire.disconnect().catch(() => {}); }
}

export async function watchObsScenes(url: string, password: string) {
  const wire = new OBSWebSocket();
  const scenes: { at: number; scene: string }[] = [];
  try {
    await wire.connect(url, password);
    const initial = await wire.call('GetCurrentProgramScene');
    scenes.push({ at: Date.now(), scene: initial.currentProgramSceneName });
    wire.on('CurrentProgramSceneChanged', (event) => { const row = { at: Date.now(), scene: event.sceneName }; scenes.push(row); console.log(JSON.stringify(row)); });
    console.log('OBS scene observer ready');
    await new Promise((resolve) => setTimeout(resolve, 90000));
    return scenes;
  } finally { await wire.disconnect().catch(() => {}); }
}

export async function showObsMain(url: string, password: string) {
  const wire = new OBSWebSocket();
  try { await wire.connect(url, password); await wire.call('SetCurrentProgramScene', { sceneName: 'Main' }); }
  finally { await wire.disconnect().catch(() => {}); }
}
