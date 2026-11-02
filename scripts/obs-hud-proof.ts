import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readObsHud, refreshObsHud, readHudState, repairObsHud } from '../src/obs/proof.ts';
try {
  if (process.argv.includes('--repair')) {
    await repairObsHud(
      process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
      process.env.OBS_WEBSOCKET_PASSWORD ?? '',
    );
    console.log('Public OBS HUD local URL and browser settings reapplied.');
    process.exit(0);
  }
  if (process.argv.includes('--state')) {
    console.log(
      JSON.stringify(
        await readHudState(
          process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
          process.env.OBS_WEBSOCKET_PASSWORD ?? '',
        ),
      ),
    );
    process.exit(0);
  }
  if (process.argv.includes('--refresh-only')) {
    await refreshObsHud(
      process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
      process.env.OBS_WEBSOCKET_PASSWORD ?? '',
    );
    console.log('OBS overlay browser refreshed.');
    process.exit(0);
  }
  const image = await readObsHud(
    process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
    process.env.OBS_WEBSOCKET_PASSWORD ?? '',
    process.argv.includes('--bridge') ? 'Spotter Relay HUD Bridge' : 'Spotter Overlay',
  );
  if (!image.startsWith('data:image/png;base64,')) throw new Error('Invalid HUD image');
  const output = process.argv[2] ?? 'data/takes/secondwind/obs-hud.png';
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, Buffer.from(image.slice('data:image/png;base64,'.length), 'base64'), {
    mode: 0o600,
  });
  console.log(
    'Private OBS HUD screenshot saved (public numeric HUD only; no camera/vision frame).',
  );
} catch {
  console.error('OBS HUD proof unavailable; no credentials displayed.');
  process.exitCode = 1;
}
