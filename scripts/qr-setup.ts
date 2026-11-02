import { setupQrObs } from '../src/obs/qr-setup.ts';
import { parseQrConfig } from '../src/core/qr.ts';
try {
  await setupQrObs(
    {
      url: process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
      password: process.env.OBS_WEBSOCKET_PASSWORD ?? '',
      privacyScene: process.env.OBS_PRIVACY_SCENE ?? 'Privacy',
    },
    parseQrConfig(process.env),
    process.argv.includes('--recover-transitions'),
  );
  console.log(
    'QR delay, uniform global Cut and opaque Privacy backstop verified. No outputs started.',
  );
} catch {
  console.error(
    'QR setup unavailable; prepare OBS with outputs stopped. No credentials displayed.',
  );
  process.exitCode = 1;
}
