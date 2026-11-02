import { mkdir, writeFile } from 'node:fs/promises';
import { probeRenderDelay } from '../src/obs/qr-probe.ts';
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => controller.abort());
let reconnect = false;
try {
  try {
    const state = (await (
      await fetch('http://127.0.0.1:3210/api/status', { signal: AbortSignal.timeout(2000) })
    ).json()) as { connected?: { obs?: boolean } };
    reconnect = state.connected?.obs === true;
    if (reconnect) {
      const response = await fetch('http://127.0.0.1:3210/api/obs/disconnect', { method: 'POST' });
      if (!response.ok) throw Error();
    }
  } catch {
    if (reconnect) throw Error('Cannot isolate Spotter OBS capture');
  }
  const result = await probeRenderDelay(
    {
      url: process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
      password: process.env.OBS_WEBSOCKET_PASSWORD ?? '',
    },
    undefined,
    controller.signal,
  );
  await mkdir('data/takes/qr-guard', { recursive: true });
  await writeFile('data/takes/qr-guard/obs-probe.json', JSON.stringify(result, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(JSON.stringify(result));
} catch (error) {
  const code =
    error && typeof error === 'object' && 'code' in error && Number.isInteger(error.code)
      ? error.code
      : null;
  console.error(
    JSON.stringify({
      error: 'OBS QR probe unavailable; no credentials or screenshots displayed',
      code,
    }),
  );
  process.exitCode = 1;
} finally {
  if (reconnect)
    await fetch('http://127.0.0.1:3210/api/obs/reconnect', { method: 'POST' }).catch(() => {});
}
