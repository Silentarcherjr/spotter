import { access, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setupObs } from '../src/obs/setup.ts';
import { updateObsEnv } from '../src/obs/setup-env.ts';

try {
  const video = process.env.VISION_VIDEO_PATH;
  if (!video) throw new Error('Set VISION_VIDEO_PATH in .env to your local clip before running obs:setup');
  const videoPath = resolve(video);
  try { await access(videoPath); } catch { throw new Error('VISION_VIDEO_PATH is not accessible'); }
  const port = Number(process.env.VITE_PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid VITE_PORT');
  const result = await setupObs({ url: process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455', password: process.env.OBS_WEBSOCKET_PASSWORD ?? '', videoPath, webOrigin: `http://127.0.0.1:${port}` });
  const envPath = resolve('.env');
  const temporary = `${envPath}.obs-setup-${process.pid}.tmp`;
  try {
    await writeFile(temporary, updateObsEnv(await readFile(envPath, 'utf8')), { mode: 0o600, flag: 'wx' });
    await rename(temporary, envPath);
  } finally { await rm(temporary, { force: true }); }
  console.log(`OBS verified: ${result.scenes.join(', ')} · sources: ${result.sources.join(', ')}`);
  console.log(`Created ${result.createdScenes} scenes, ${result.createdInputs} inputs, ${result.createdSceneItems} scene items · canvas ${result.canvas.width}×${result.canvas.height}`);
  console.log('.env updated for scene-switch privacy (no blur filter). Run npm run dev to serve the browser sources; restart it after .env changes.');
} catch (error) {
  // Our adapter exposes only allowlisted diagnostics, never underlying OBS errors or credentials.
  const message = error instanceof Error && /^(OBS |Set VISION_VIDEO_PATH|VISION_VIDEO_PATH|Invalid VITE_PORT)/.test(error.message) ? error.message : 'OBS setup unavailable; check local files and configuration';
  console.error(message); process.exitCode = 1;
}
