import type { SetupWire } from './setup.ts';
/** Avoid OBS #11914: uniform global Cut, no Main/Privacy overrides. Recovery is explicitly offline only. */
export async function prepareQrTransitions(wire: SetupWire, privacyScene: string, recover = false) {
  const list = await wire.call('GetSceneTransitionList');
  const cut = (list.transitions as { transitionName: string; transitionKind: string }[]).find(
    (t) => t.transitionKind === 'cut_transition',
  );
  if (!cut) throw Error('Cut transition missing');
  const scenes = [...new Set(['Main', privacyScene])];
  const overrides = await Promise.all(
    scenes.map((sceneName) => wire.call('GetSceneSceneTransitionOverride', { sceneName })),
  );
  const ready =
    list.currentSceneTransitionKind === 'cut_transition' &&
    overrides.every((o) => o.transitionName === null);
  if (ready && !recover) return;
  if (
    (await wire.call('GetStreamStatus')).outputActive ||
    (await wire.call('GetRecordStatus')).outputActive
  )
    throw Error('Prepare QR transitions before outputs');
  if (!ready) {
    await wire.call('SetCurrentSceneTransition', { transitionName: cut.transitionName });
    for (const sceneName of scenes) {
      // Protocol explicitly accepts null to clear overrides; obs-websocket-js typing omits null.
      await wire.call('SetSceneSceneTransitionOverride', {
        sceneName,
        transitionName: null as unknown as string,
        transitionDuration: null as unknown as number,
      });
    }
  }
  if (recover) {
    const original = (await wire.call('GetStudioModeEnabled')).studioModeEnabled;
    const preview = original
      ? (await wire.call('GetCurrentPreviewScene')).currentPreviewSceneName
      : null;
    const set = async (value: boolean) => {
      await wire.call('SetStudioModeEnabled', { studioModeEnabled: value });
      for (let i = 0; i < 40; i++) {
        if ((await wire.call('GetStudioModeEnabled')).studioModeEnabled === value) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw Error('Studio recovery unavailable');
    };
    try {
      await set(!original);
    } finally {
      await set(original);
      if (preview) await wire.call('SetCurrentPreviewScene', { sceneName: preview });
    }
  }
}
