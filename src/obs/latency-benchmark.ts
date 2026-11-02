import OBSWebSocket from 'obs-websocket-js';
import { ObsClient } from './client.ts';
import type { ObsConfig, ObsWire } from './client.ts';
import { OffTheMap } from '../modules/offthemap/runtime.ts';
import type { ResponsesAI } from '../ai/responses.ts';
import { distribution } from '../observability/metrics.ts';
/** Controlled local-clip benchmark. Never starts/stops stream or recording outputs. */
export async function benchmarkLatency(
  config: ObsConfig,
  ai: ResponsesAI,
  intervalMs: number,
  trials = 10,
  progress: (trial: number, sceneMs: number | null) => void = () => {},
  fixturePath?: string,
  signal?: AbortSignal,
  wire: ObsWire = new OBSWebSocket(),
) {
  const obs = new ObsClient(config);
  await wire.connect(config.url, config.password);
  let savedScene: string | null = null;
  let savedSettings:
    Awaited<ReturnType<typeof wire.call<'GetInputSettings'>>>['inputSettings'] | null = null;
  let savedMedia: { mediaState: string; mediaCursor?: number } | null = null;
  const rows: {
    trial: number;
    captureMs: number | null;
    modelMs: number | null;
    analysisMs: number | null;
    sceneMs: number | null;
    attempts: number;
    unavailable: number;
    confirmationFailed: number;
  }[] = [];
  try {
    const stream = await wire.call('GetStreamStatus');
    const record = await wire.call('GetRecordStatus');
    if (stream.outputActive || record.outputActive)
      throw Error('Stop stream and recording before controlled benchmark');
    savedScene = (await wire.call('GetCurrentProgramScene')).currentProgramSceneName;
    savedMedia = await wire.call('GetMediaInputStatus', { inputName: 'Spotter IRL' });
    if (fixturePath) {
      savedSettings = (await wire.call('GetInputSettings', { inputName: 'Spotter IRL' }))
        .inputSettings;
      await wire.call('SetInputSettings', {
        inputName: 'Spotter IRL',
        inputSettings: { is_local_file: true, local_file: fixturePath, looping: true },
        overlay: true,
      });
    }
    await obs.start();
    if (!obs.connected) throw Error('OBS unavailable');
    for (let i = 0; i < trials; i++) {
      signal?.throwIfAborted();
      if (
        (await wire.call('GetStreamStatus')).outputActive ||
        (await wire.call('GetRecordStatus')).outputActive
      )
        throw Error('Output became active; benchmark stopped');
      await wire.call('SetCurrentProgramScene', { sceneName: 'Main' });
      await wire.call('TriggerMediaInputAction', {
        inputName: 'Spotter IRL',
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      await wire.call('SetMediaInputCursor', { inputName: 'Spotter IRL', mediaCursor: 4000 });
      await new Promise((resolve) => setTimeout(resolve, 500));
      const run = new OffTheMap({
        available: () => obs.connected,
        capture: () => obs.capture(),
        analyze: (image) => ai.vision(image),
        privacy: () => obs.applyPrivacy(),
        confirmPrivacy: () => obs.confirmPrivacy(),
        restore: () => obs.restore(),
        marker: async () => {},
      });
      for (let sample = 0; sample < 9; sample++) {
        signal?.throwIfAborted();
        const start = performance.now();
        await run.sample(Date.now());
        if (run.latency().scene.n) break;
        if (sample < 8)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(0, intervalMs - (performance.now() - start))),
          );
      }
      const stats = run.latency();
      rows.push({
        trial: i + 1,
        captureMs: stats.capture.medianMs,
        modelMs: stats.model.medianMs,
        analysisMs: stats.analysis.medianMs,
        sceneMs: stats.scene.medianMs,
        attempts: stats.attempts,
        unavailable: stats.unavailable,
        confirmationFailed: stats.confirmationFailed,
      });
      progress(i + 1, stats.scene.medianMs);
      await obs.restore();
    }
    return {
      at: new Date().toISOString(),
      controlled: true,
      simulatedInput: !!fixturePath,
      trials,
      intervalMs,
      width: config.frameWidth ?? 1280,
      cueMs: 4000,
      endpoint: 'capture start to OBS program scene readback; not viewer latency',
      markerExcluded: true,
      rows,
      scene: distribution(rows.flatMap((row) => (row.sceneMs === null ? [] : [row.sceneMs]))),
      analysisPerTrialMedians: distribution(
        rows.flatMap((row) => (row.analysisMs === null ? [] : [row.analysisMs])),
      ),
      unavailable: rows.reduce((sum, row) => sum + row.unavailable, 0),
    };
  } finally {
    await obs.restore().catch(() => {});
    await obs.stop();
    if (savedSettings)
      await wire
        .call('SetInputSettings', {
          inputName: 'Spotter IRL',
          inputSettings: savedSettings,
          overlay: false,
        })
        .catch(() => {});
    if (savedScene !== null)
      await wire.call('SetCurrentProgramScene', { sceneName: savedScene }).catch(() => {});
    if (savedMedia) {
      if (typeof savedMedia.mediaCursor === 'number' && savedMedia.mediaCursor >= 0)
        await wire
          .call('SetMediaInputCursor', {
            inputName: 'Spotter IRL',
            mediaCursor: savedMedia.mediaCursor,
          })
          .catch(() => {});
      const action =
        savedMedia.mediaState === 'OBS_MEDIA_STATE_PLAYING'
          ? 'PLAY'
          : savedMedia.mediaState === 'OBS_MEDIA_STATE_PAUSED'
            ? 'PAUSE'
            : 'STOP';
      await wire
        .call('TriggerMediaInputAction', {
          inputName: 'Spotter IRL',
          mediaAction: `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_${action}`,
        })
        .catch(() => {});
    }
    await wire.disconnect().catch(() => {});
  }
}
