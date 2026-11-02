import { mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { qrDemo } from '../src/obs/qr-demo.ts';
import { recordQrProgram } from '../src/obs/qr-program-record.ts';
import { runQrProgramTrial } from '../src/obs/qr-program-trial.ts';
import { parseQrConfig } from '../src/core/qr.ts';
const mode = process.argv[2] ?? 'control';
const directory = resolve('data/takes/qr-guard');
let saved: Awaited<ReturnType<typeof qrDemo>> = null;
let reconnect = false;
try {
  if (!['control', 'observed', 'protected', 'dismiss'].includes(mode)) throw Error('Unknown mode');
  const state = (await (await fetch('http://127.0.0.1:3210/api/status')).json()) as {
    connected?: { obs?: boolean };
  };
  reconnect = state.connected?.obs === true;
  if (reconnect) {
    const r = await fetch('http://127.0.0.1:3210/api/obs/disconnect', { method: 'POST' });
    if (!r.ok) throw Error('Isolation failed');
  }
  const url = process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
    password = process.env.OBS_WEBSOCKET_PASSWORD ?? '',
    source = parseQrConfig(process.env).source;
  await mkdir(directory, { recursive: true });
  saved = await qrDemo(url, password, source, resolve(directory, 'motion-loop.mp4'));
  await writeFile(resolve(directory, `program-media-${mode}-restore.json`), JSON.stringify(saved), {
    mode: 0o600,
  });
  const output = await recordQrProgram(
    url,
    password,
    directory,
    async () => {
      if (mode === 'control') {
        await new Promise((r) => setTimeout(r, 18000));
        return { mode, durationMs: 18000 };
      }
      return runQrProgramTrial(
        { url, password, source, privacyScene: process.env.OBS_PRIVACY_SCENE ?? 'Privacy' },
        parseQrConfig(process.env),
        mode as 'observed' | 'protected' | 'dismiss',
      );
    },
    undefined,
    async (s) => {
      await writeFile(
        resolve(directory, `program-profile-${mode}-restore.json`),
        JSON.stringify(s),
        { mode: 0o600 },
      );
    },
  );
  const target = resolve(directory, `program-${mode}-20261102.mov`);
  await rename(output.path, target);
  await writeFile(
    resolve(directory, `program-${mode}-20261102.json`),
    JSON.stringify(output.result, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ file: target, mode }));
} catch {
  console.error('Program proof unavailable; credentials and frames withheld.');
  process.exitCode = 1;
} finally {
  if (saved)
    await qrDemo(
      process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
      process.env.OBS_WEBSOCKET_PASSWORD ?? '',
      parseQrConfig(process.env).source,
      null,
      saved,
    );
  if (reconnect && !process.argv.includes('--leave-disconnected'))
    await fetch('http://127.0.0.1:3210/api/obs/reconnect', { method: 'POST' }).catch(() => {});
}
