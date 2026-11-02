import type { SetupWire } from './setup.ts';
const backstop = 'Spotter QR Privacy Backstop';
const color = 0xff20120c;
type Item = {
  sourceName: string;
  sceneItemId: number;
  sceneItemIndex: number;
  sceneItemEnabled: boolean;
};
function full(t: Record<string, unknown>, width: number, height: number): boolean {
  return (
    t.positionX === 0 &&
    t.positionY === 0 &&
    t.alignment === 5 &&
    t.rotation === 0 &&
    t.boundsType === 'OBS_BOUNDS_STRETCH' &&
    t.boundsWidth === width &&
    t.boundsHeight === height &&
    ['cropTop', 'cropBottom', 'cropLeft', 'cropRight'].every((k) => !t[k])
  );
}
/** Keep delayed Main rendering behind a separately opaque stock color in Privacy. */
export async function prepareQrLayout(
  wire: SetupWire,
  privacyScene: string,
  verifyOnly = false,
): Promise<void> {
  const { baseWidth: width, baseHeight: height } = await wire.call('GetVideoSettings');
  const mainItems = (await wire.call('GetSceneItemList', { sceneName: 'Main' }))
    .sceneItems as unknown as Item[];
  if (mainItems.some((i) => i.sourceName === privacyScene)) throw Error('QR privacy layout cycle');
  const items = (await wire.call('GetSceneItemList', { sceneName: privacyScene }))
    .sceneItems as unknown as Item[];
  const mains = items.filter((i) => i.sourceName === 'Main'),
    covers = items.filter((i) => i.sourceName === backstop);
  if (mains.length > 1 || covers.length > 1) throw Error('Duplicate QR privacy items');
  let settings: Record<string, unknown> | null = null;
  try {
    const input = await wire.call('GetInputSettings', { inputName: backstop });
    if (input.inputKind !== 'color_source_v3' && input.inputKind !== 'color_source')
      throw Error('QR backstop collision');
    settings = input.inputSettings;
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 600)) throw error;
  }
  if (
    settings &&
    (await wire.call('GetSourceFilterList', { sourceName: backstop })).filters.some(
      (f) => f.filterEnabled,
    )
  )
    throw Error('QR backstop filters unavailable');
  const colorReady =
    settings?.color === color && settings.width === width && settings.height === height;
  const ready =
    mains[0]?.sceneItemEnabled &&
    mains[0].sceneItemIndex === 0 &&
    covers[0]?.sceneItemEnabled &&
    covers[0].sceneItemIndex === 1 &&
    colorReady;
  if (ready) {
    const a = (
      await wire.call('GetSceneItemTransform', {
        sceneName: privacyScene,
        sceneItemId: mains[0]!.sceneItemId,
      })
    ).sceneItemTransform;
    const b = (
      await wire.call('GetSceneItemTransform', {
        sceneName: privacyScene,
        sceneItemId: covers[0]!.sceneItemId,
      })
    ).sceneItemTransform;
    const blend = (
      await wire.call('GetSceneItemBlendMode', {
        sceneName: privacyScene,
        sceneItemId: covers[0]!.sceneItemId,
      })
    ).sceneItemBlendMode;
    if (full(a, width, height) && full(b, width, height) && blend === 'OBS_BLEND_NORMAL') return;
  }
  if (verifyOnly) throw Error('QR privacy layout verification unavailable');
  if (
    (await wire.call('GetStreamStatus')).outputActive ||
    (await wire.call('GetRecordStatus')).outputActive
  )
    throw Error('Prepare QR privacy layout before streaming');
  const mainId =
    mains[0]?.sceneItemId ??
    (
      await wire.call('CreateSceneItem', {
        sceneName: privacyScene,
        sourceName: 'Main',
        sceneItemEnabled: true,
      })
    ).sceneItemId;
  let coverId = covers[0]?.sceneItemId;
  if (!settings) {
    coverId = (
      await wire.call('CreateInput', {
        sceneName: privacyScene,
        inputName: backstop,
        inputKind: 'color_source_v3',
        inputSettings: { color, width, height },
        sceneItemEnabled: true,
      })
    ).sceneItemId;
  } else {
    if (!colorReady)
      await wire.call('SetInputSettings', {
        inputName: backstop,
        inputSettings: { color, width, height },
        overlay: true,
      });
    coverId ??= (
      await wire.call('CreateSceneItem', {
        sceneName: privacyScene,
        sourceName: backstop,
        sceneItemEnabled: true,
      })
    ).sceneItemId;
  }
  for (const [id, index] of [
    [mainId, 0],
    [coverId, 1],
  ] as const) {
    await wire.call('SetSceneItemTransform', {
      sceneName: privacyScene,
      sceneItemId: id,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        alignment: 5,
        rotation: 0,
        cropTop: 0,
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0,
        boundsType: 'OBS_BOUNDS_STRETCH',
        boundsWidth: width,
        boundsHeight: height,
      },
    });
    await wire.call('SetSceneItemEnabled', {
      sceneName: privacyScene,
      sceneItemId: id,
      sceneItemEnabled: true,
    });
    await wire.call('SetSceneItemIndex', {
      sceneName: privacyScene,
      sceneItemId: id,
      sceneItemIndex: index,
    });
  }
  await wire.call('SetSceneItemBlendMode', {
    sceneName: privacyScene,
    sceneItemId: coverId,
    sceneItemBlendMode: 'OBS_BLEND_NORMAL',
  });
  await prepareQrLayout(wire, privacyScene, true);
}
