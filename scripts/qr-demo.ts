import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { qrDemo } from '../src/obs/qr-demo.ts';
import type { QrDemoState } from '../src/obs/qr-demo.ts';
import { parseQrConfig } from '../src/core/qr.ts';
try {
  const config = parseQrConfig(process.env);
  const statePath = 'data/takes/qr-guard/demo-restore.json';
  if (process.argv.includes('--restore')) {
    const state = JSON.parse(await readFile(statePath, 'utf8')) as QrDemoState;
    await qrDemo(
      process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
      process.env.OBS_WEBSOCKET_PASSWORD ?? '',
      config.source,
      null,
      state,
    );
    console.log('Original local media/scene restored.');
  } else {
    try {
      await access(statePath);
      throw Error('Saved demo state already exists');
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
        throw error;
    }
    const state = await qrDemo(
      process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
      process.env.OBS_WEBSOCKET_PASSWORD ?? '',
      config.source,
      resolve('data/takes/qr-guard/motion-loop.mp4'),
    );
    await mkdir('data/takes/qr-guard', { recursive: true });
    await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    console.log(
      'Moving TEST-ONLY input ready in Main; no outputs started. Original settings saved privately.',
    );
  }
} catch {
  console.error('QR demo setup unavailable; no credentials displayed.');
  process.exitCode = 1;
}
