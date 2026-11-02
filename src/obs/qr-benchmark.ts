import OBSWebSocket from 'obs-websocket-js';
import type { OBSRequestTypes } from 'obs-websocket-js';
import { ObsClient } from './client.ts';
import type { ObsConfig } from './client.ts';
import type { QrConfig } from '../core/qr.ts';
import { QrGuard } from '../modules/qrguard/runtime.ts';
import { QrSensor } from '../qr/sensor.ts';
import { PrivacyCoordinator } from '../modules/privacy.ts';
import { DatabaseSync } from 'node:sqlite';
export async function benchmarkQr(
  config: ObsConfig,
  policy: QrConfig,
  path: string,
  trials: number,
  progress: (n: number) => void,
  signal?: AbortSignal,
) {
  const wire = new OBSWebSocket();
  const obs = new ObsClient(config);
  let scene: string | null = null;
  let settings: Awaited<ReturnType<typeof wire.call<'GetInputSettings'>>>['inputSettings'] | null =
    null;
  let media: Awaited<ReturnType<typeof wire.call<'GetMediaInputStatus'>>> | null = null;
  let transform: {
    id: number;
    value: OBSRequestTypes['SetSceneItemTransform']['sceneItemTransform'];
  } | null = null;
  let guard: QrGuard | null = null;
  let sensor: QrSensor | null = null;
  const db = new DatabaseSync(':memory:');
  await wire.connect(config.url, config.password);
  try {
    if (
      (await wire.call('GetStreamStatus')).outputActive ||
      (await wire.call('GetRecordStatus')).outputActive
    )
      throw Error('Stop outputs before QR benchmark');
    scene = (await wire.call('GetCurrentProgramScene')).currentProgramSceneName;
    settings = (await wire.call('GetInputSettings', { inputName: policy.source })).inputSettings;
    media = await wire.call('GetMediaInputStatus', { inputName: policy.source });
    const item = (
      (await wire.call('GetSceneItemList', { sceneName: 'Main' })).sceneItems as {
        sourceName: string;
        sceneItemId: number;
      }[]
    ).find((item) => item.sourceName === policy.source);
    if (!item) throw Error('QR source not in Main');
    const old = (
      await wire.call('GetSceneItemTransform', { sceneName: 'Main', sceneItemId: item.sceneItemId })
    ).sceneItemTransform as {
      positionX: number;
      positionY: number;
      scaleX: number;
      scaleY: number;
    };
    transform = {
      id: item.sceneItemId,
      value: {
        positionX: old.positionX,
        positionY: old.positionY,
        scaleX: old.scaleX,
        scaleY: old.scaleY,
      },
    };
    await wire.call('SetInputSettings', {
      inputName: policy.source,
      inputSettings: {
        is_local_file: true,
        local_file: path,
        looping: true,
        restart_on_activate: false,
        close_when_inactive: false,
      },
      overlay: true,
    });
    const video = await wire.call('GetVideoSettings');
    await wire.call('SetSceneItemTransform', {
      sceneName: 'Main',
      sceneItemId: item.sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        scaleX: video.baseWidth / 1280,
        scaleY: video.baseHeight / 720,
      },
    });
    await obs.start();
    await obs.prepareQr(policy.source, policy.renderDelayMs);
    const privacy = new PrivacyCoordinator({
      protect: () => obs.applyPrivacy(),
      restore: () => obs.restore(),
    });
    guard = new QrGuard(policy, db, {
      available: () => obs.connected,
      protect: () => privacy.hold('qr_guard', true),
      confirm: () => obs.confirmPrivacy(),
      release: () => privacy.hold('qr_guard', false),
      marker: async () => {},
    });
    sensor = new QrSensor(
      {
        capture: async () => {
          await obs.prepareQr(policy.source, policy.renderDelayMs);
          return obs.capturePng(policy.source, policy.frameWidth);
        },
        observe: (value, timing) => guard!.observe(value, timing),
        unavailable: () => guard!.unavailable(),
      },
      policy.intervalMs,
    );
    await wire.call('SetCurrentProgramScene', { sceneName: 'Main' });
    await wire.call('TriggerMediaInputAction', {
      inputName: policy.source,
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
    });
    const started = performance.now();
    let seen = 0;
    let unavailableSince: number | null = null;
    let lastCheck = 0;
    sensor.start();
    while (seen < trials && performance.now() - started < trials * 6500 + 15000) {
      signal?.throwIfAborted();
      const state = guard.snapshot();
      if (state.status === 'unavailable') {
        unavailableSince ??= performance.now();
        if (performance.now() - unavailableSince > 6000) throw Error('QR benchmark unavailable');
      } else unavailableSince = null;
      if (state.latency.detectionToScene.n > seen) {
        seen = state.latency.detectionToScene.n;
        progress(seen);
      }
      if (performance.now() - lastCheck > 1000) {
        lastCheck = performance.now();
        if ((await wire.call('GetStreamStatus')).outputActive)
          throw Error('Output started during benchmark');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (seen < trials) throw Error('QR benchmark incomplete');
    const state = guard.snapshot();
    return {
      at: new Date().toISOString(),
      syntheticInput: true,
      realObs: true,
      markerExcluded: true,
      trials: seen,
      intervalMs: policy.intervalMs,
      width: policy.frameWidth,
      expectedDelayMs: policy.renderDelayMs,
      latency: state.latency,
      lastLatency: state.lastLatency,
      entries: state.entries,
      framePeriodMs: (1000 * video.fpsDenominator) / video.fpsNumerator,
    };
  } finally {
    sensor?.stop();
    if (guard) {
      await guard.dismiss().catch(() => {});
      await guard.stop();
    }
    await obs.stop();
    db.close();
    if (settings)
      await wire
        .call('SetInputSettings', {
          inputName: policy.source,
          inputSettings: settings,
          overlay: false,
        })
        .catch(() => {});
    if (transform)
      await wire
        .call('SetSceneItemTransform', {
          sceneName: 'Main',
          sceneItemId: transform.id,
          sceneItemTransform: transform.value,
        })
        .catch(() => {});
    if (scene !== null)
      await wire.call('SetCurrentProgramScene', { sceneName: scene }).catch(() => {});
    if (media) {
      if (typeof media.mediaCursor === 'number' && media.mediaCursor >= 0)
        await wire
          .call('SetMediaInputCursor', { inputName: policy.source, mediaCursor: media.mediaCursor })
          .catch(() => {});
      const action =
        media.mediaState === 'OBS_MEDIA_STATE_PLAYING'
          ? 'PLAY'
          : media.mediaState === 'OBS_MEDIA_STATE_PAUSED'
            ? 'PAUSE'
            : 'STOP';
      await wire
        .call('TriggerMediaInputAction', {
          inputName: policy.source,
          mediaAction: `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_${action}`,
        })
        .catch(() => {});
    }
    await wire.disconnect().catch(() => {});
  }
}
