import OBSWebSocket from 'obs-websocket-js';
import { inflateSync } from 'node:zlib';
import { distribution } from '../observability/metrics.ts';
import type { SetupWire } from './setup.ts';
const names = { source: 'Spotter QR timing probe', filter: 'Spotter QR temporary delay' };
/** Only for a synthetic full-color probe. No QR decoding, screenshots retained or disk writes. */
export function firstPixel(data: string): number[] {
  if (!data.startsWith('data:image/png;base64,')) throw Error('Expected probe PNG');
  const bytes = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Invalid PNG');
  const idat: Buffer[] = [];
  let color = -1;
  let depth = 0;
  let palette: Buffer | undefined;
  for (let i = 8; i + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(i);
    if (i + 12 + length > bytes.length) throw Error('Invalid PNG chunk');
    const type = bytes.toString('ascii', i + 4, i + 8);
    const body = bytes.subarray(i + 8, i + 8 + length);
    if (type === 'IHDR') {
      depth = body[8]!;
      color = body[9]!;
    }
    if (type === 'PLTE') palette = body;
    if (type === 'IDAT') idat.push(body);
    i += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: 8_000_000 });
  // The first pixel has no left/up neighbours for PNG filters0–4.
  if (raw[0]! > 4) throw Error('Invalid PNG filter');
  if (depth === 8 && (color === 2 || color === 6)) return [...raw.subarray(1, 4)];
  if (color === 3 && palette && [1, 2, 4, 8].includes(depth)) {
    const index = raw[1]! >>> (8 - depth);
    return [...palette.subarray(index * 3, index * 3 + 3)];
  }
  throw Error('Unsupported probe PNG');
}
export function summarizeLead(values: readonly number[]) {
  const minimum = Math.min(0, ...values);
  const stats = distribution(values.map((value) => value - minimum));
  return {
    ...stats,
    medianMs: stats.medianMs === null ? null : stats.medianMs + minimum,
    p95Ms: stats.p95Ms === null ? null : stats.p95Ms + minimum,
  };
}
export async function probeRenderDelay(
  config: { url: string; password: string },
  wire: SetupWire = new OBSWebSocket(),
  signal?: AbortSignal,
) {
  let previous: string | null = null;
  let inputCreated = false;
  let filterCreated = false;
  let restored = true;
  await wire.connect(config.url, config.password);
  try {
    const stream = await wire.call('GetStreamStatus');
    const record = await wire.call('GetRecordStatus');
    if (stream.outputActive || record.outputActive) throw Error('Stop outputs before probing');
    const inputs = await wire.call('GetInputList');
    const filters = await wire.call('GetSourceFilterList', { sourceName: 'Main' });
    if (
      inputs.inputs.some((input) => input.inputName === names.source) ||
      filters.filters.some((filter) => filter.filterName === names.filter)
    )
      throw Error('Probe names already exist');
    if (filters.filters.some((filter) => filter.filterEnabled))
      throw Error('Main already has active filters; isolate them before probing');
    const version = await wire.call('GetVersion');
    const video = await wire.call('GetVideoSettings');
    previous = (await wire.call('GetCurrentProgramScene')).currentProgramSceneName;
    const kinds = (await wire.call('GetInputKindList')).inputKinds;
    const kind = kinds.find((name) => /^color_source/.test(name));
    if (!kind) throw Error('Built-in color source missing');
    const made = await wire.call('CreateInput', {
      sceneName: 'Main',
      inputName: names.source,
      inputKind: kind,
      inputSettings: { color: 0xff0000ff, width: video.baseWidth, height: video.baseHeight },
      sceneItemEnabled: true,
    });
    inputCreated = true;
    await wire.call('SetSceneItemTransform', {
      sceneName: 'Main',
      sceneItemId: made.sceneItemId,
      sceneItemTransform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1 },
    });
    await wire.call('CreateSourceFilter', {
      sourceName: 'Main',
      filterName: names.filter,
      filterKind: 'gpu_delay',
      filterSettings: { delay_ms: 500 },
    });
    filterCreated = true;
    const filter = await wire.call('GetSourceFilter', {
      sourceName: 'Main',
      filterName: names.filter,
    });
    await wire.call('SetCurrentProgramScene', { sceneName: 'Main' });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const screenshotDurations: number[] = [];
    for (let i = 0; i < 50; i++) {
      signal?.throwIfAborted();
      const start = performance.now();
      await wire.call('GetSourceScreenshot', {
        sourceName: names.source,
        imageFormat: 'jpg',
        imageWidth: 1280,
      });
      screenshotDurations.push(performance.now() - start);
    }
    const transitions: {
      rawSeenMs: number | null;
      delayedSeenMs: number | null;
      leadMs: number | null;
      pollingMaxMs: number;
    }[] = [];
    for (let trial = 0; trial < 8; trial++) {
      signal?.throwIfAborted();
      const green = trial % 2 === 0;
      const start = performance.now();
      let rawSeenMs: number | null = null;
      let delayedSeenMs: number | null = null;
      let pollingMaxMs = 0;
      await wire.call('SetInputSettings', {
        inputName: names.source,
        inputSettings: { color: green ? 0xff00ff00 : 0xff0000ff },
        overlay: true,
      });
      while (performance.now() - start < 2000 && (rawSeenMs === null || delayedSeenMs === null)) {
        signal?.throwIfAborted();
        const pollStart = performance.now();
        const capture = async (sourceName: string) => {
          const data = await wire.call('GetSourceScreenshot', {
            sourceName,
            imageFormat: 'png',
            imageWidth: 1280,
          });
          const at = performance.now() - start;
          return { at, rgb: firstPixel(data.imageData) };
        };
        const [raw, delayed] = await Promise.all([capture(names.source), capture('Main')]);
        const matches = (rgb: number[]) =>
          green ? rgb[1]! > 180 && rgb[0]! < 50 : rgb[0]! > 180 && rgb[1]! < 50;
        if (rawSeenMs === null && matches(raw.rgb)) rawSeenMs = raw.at;
        if (delayedSeenMs === null && matches(delayed.rgb)) delayedSeenMs = delayed.at;
        pollingMaxMs = Math.max(pollingMaxMs, performance.now() - pollStart);
        if (delayedSeenMs === null) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      transitions.push({
        rawSeenMs,
        delayedSeenMs,
        leadMs: rawSeenMs === null || delayedSeenMs === null ? null : delayedSeenMs - rawSeenMs,
        pollingMaxMs,
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const measuredLead = transitions.flatMap((row) => (row.leadMs === null ? [] : [row.leadMs]));
    return {
      at: new Date().toISOString(),
      obsVersion: version.obsVersion,
      websocketVersion: version.obsWebSocketVersion,
      sourceUnfiltered: true,
      filterOn: 'Main',
      filterKind: filter.filterKind,
      filterEnabled: filter.filterEnabled,
      configuredDelayMs: filter.filterSettings.delay_ms,
      capture1280Jpeg: distribution(screenshotDurations),
      leadMs: summarizeLead(measuredLead),
      transitions,
      restored,
    };
  } finally {
    if (previous !== null)
      await wire.call('SetCurrentProgramScene', { sceneName: previous }).catch(() => {
        restored = false;
      });
    if (filterCreated)
      await wire
        .call('RemoveSourceFilter', { sourceName: 'Main', filterName: names.filter })
        .catch(() => {
          restored = false;
        });
    if (inputCreated)
      await wire.call('RemoveInput', { inputName: names.source }).catch(() => {
        restored = false;
      });
    await wire.disconnect().catch(() => {
      restored = false;
    });
    if (!restored) throw Error('Probe cleanup needs review');
  }
}
