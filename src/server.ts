import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from './app.ts';

process.umask(0o077);
const databasePath = process.env.DATABASE_PATH ?? 'data/spotter.sqlite';
mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
const port = Number(process.env.PORT ?? 3210);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
if (existsSync(databasePath) && databasePath !== ':memory:') chmodSync(databasePath, 0o600);
const twitch = process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET ? {
  clientId: process.env.TWITCH_CLIENT_ID, clientSecret: process.env.TWITCH_CLIENT_SECRET,
  redirectUri: process.env.TWITCH_REDIRECT_URI ?? `http://localhost:${port}/api/twitch/callback`,
} : undefined;
const obs = process.env.OBS_WEBSOCKET_PASSWORD ? {
  url: process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455', password: process.env.OBS_WEBSOCKET_PASSWORD,
  privacyScene: process.env.OBS_PRIVACY_SCENE ?? 'Privacy',
  ...(process.env.OBS_SOURCE ? { source: process.env.OBS_SOURCE } : {}),
  ...(process.env.OBS_BLUR_FILTER ? { blurFilter: process.env.OBS_BLUR_FILTER } : {}),
} : undefined;
const ai = process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL } : undefined;
const app = createApp({ databasePath, simulated: process.env.SIM === '1', ...(twitch ? { twitch } : {}), ...(obs ? { obs } : {}), ...(ai ? { ai } : {}), ...(process.env.SIM_FRAME_DIR ? { frameDirectory: process.env.SIM_FRAME_DIR } : {}) });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close(); });
}
await app.listen({ host: '127.0.0.1', port });
console.log(`Spotter API: http://127.0.0.1:${port}`);
