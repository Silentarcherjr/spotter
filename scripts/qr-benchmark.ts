import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { benchmarkQr } from '../src/obs/qr-benchmark.ts';
import { parseQrConfig } from '../src/core/qr.ts';
const controller = new AbortController();
for (const name of ['SIGINT', 'SIGTERM'] as const) process.once(name, () => controller.abort());
let reconnect = false;
try {
  try {
    const state = (await (
      await fetch('http://127.0.0.1:3210/api/status', { signal: AbortSignal.timeout(2000) })
    ).json()) as { connected?: { obs?: boolean } };
    reconnect = state.connected?.obs === true;
    if (reconnect) await fetch('http://127.0.0.1:3210/api/obs/disconnect', { method: 'POST' });
  } catch {}
  const config = parseQrConfig(process.env);
  const trials = Number(process.argv[process.argv.indexOf('--trials') + 1] ?? 20);
  const result = await benchmarkQr(
    {
      url: process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
      password: process.env.OBS_WEBSOCKET_PASSWORD ?? '',
      privacyScene: process.env.OBS_PRIVACY_SCENE ?? 'Privacy',
      source: config.source,
    },
    config,
    resolve(
      process.argv.includes('--moving')
        ? 'data/takes/qr-guard/motion-loop.mp4'
        : 'data/takes/qr-guard/test-loop.mp4',
    ),
    process.argv.includes('--trials') ? trials : 20,
    (n) => console.log(`Confirmed QR protection${n}`),
    controller.signal,
  );
  await mkdir('data/takes/qr-guard', { recursive: true });
  await writeFile(
    `data/takes/qr-guard/latency-${result.intervalMs}ms${process.argv.includes('--moving') ? '-moving' : ''}.json`,
    JSON.stringify(result, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
} catch (error) {
  const code =
    error && typeof error === 'object' && 'code' in error && Number.isInteger(error.code)
      ? error.code
      : null;
  console.error(
    JSON.stringify({ error: 'QR benchmark unavailable; no credentials or frames displayed', code }),
  );
  process.exitCode = 1;
} finally {
  if (reconnect)
    await fetch('http://127.0.0.1:3210/api/obs/reconnect', { method: 'POST' }).catch(() => {});
}
