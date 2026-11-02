import { parseQrConfig } from './core/qr.ts';
import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseCrewConfig } from './modules/tagout/crew.ts';
import {
  parseChatAutoDelete,
  parseVisionCaptureIntervalMs,
  parseVisionFrameWidth,
  parseAiTimeoutMs,
  parseEnergyAlertThreshold,
  parseTagOutEnergyThreshold,
  parseTagOutSustainS,
} from './config.ts';
import { parseVisionDetail } from './ai/responses.ts';
import { createApp } from './app.ts';

process.umask(0o077);
const databasePath = process.env.DATABASE_PATH ?? 'data/spotter.sqlite';
mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
const port = Number(process.env.PORT ?? 3210);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
if (existsSync(databasePath) && databasePath !== ':memory:') chmodSync(databasePath, 0o600);
const twitch =
  process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET
    ? {
        clientId: process.env.TWITCH_CLIENT_ID,
        clientSecret: process.env.TWITCH_CLIENT_SECRET,
        redirectUri:
          process.env.TWITCH_REDIRECT_URI ?? `http://localhost:${port}/api/twitch/callback`,
      }
    : undefined;
const obs = process.env.OBS_WEBSOCKET_PASSWORD
  ? {
      frameWidth: parseVisionFrameWidth(process.env.VISION_FRAME_WIDTH),
      url: process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
      password: process.env.OBS_WEBSOCKET_PASSWORD,
      privacyScene: process.env.OBS_PRIVACY_SCENE ?? 'Privacy',
      ...(process.env.OBS_SOURCE ? { source: process.env.OBS_SOURCE } : {}),
      ...(process.env.OBS_BLUR_FILTER ? { blurFilter: process.env.OBS_BLUR_FILTER } : {}),
    }
  : undefined;
const ai =
  process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL
    ? {
        timeoutMs: parseAiTimeoutMs(process.env.AI_TIMEOUT_MS),
        baseURL: process.env.AI_BASE_URL ?? '',
        key: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL,
        detail: parseVisionDetail(process.env.OPENAI_VISION_DETAIL),
      }
    : undefined;
const crew = process.env.CREW_FILE
  ? parseCrewConfig(JSON.parse(await readFile(process.env.CREW_FILE, 'utf8')) as unknown)
  : [];
const app = createApp({
  qr: parseQrConfig(process.env),
  chatAutoDelete: parseChatAutoDelete(process.env.CHAT_AUTO_DELETE),
  visionCaptureIntervalMs: parseVisionCaptureIntervalMs(process.env.VISION_CAPTURE_INTERVAL_MS),
  tagoutPolicy: {
    energyThreshold: parseTagOutEnergyThreshold(process.env.TAGOUT_ENERGY_THRESHOLD),
    sustainSeconds: parseTagOutSustainS(process.env.TAGOUT_SUSTAIN_S),
  },
  energyAlertThreshold: parseEnergyAlertThreshold(process.env.ENERGY_ALERT_THRESHOLD),
  databasePath,
  simulated: process.env.SIM === '1',
  ...(process.env.SIM_DISPLAY_NAME ? { demoDisplayName: process.env.SIM_DISPLAY_NAME } : {}),
  ...(twitch ? { twitch } : {}),
  ...(obs ? { obs } : {}),
  ...(ai ? { ai } : {}),
  crew,
  exposureThresholds: {
    warn: Number(process.env.EXPOSURE_WARN ?? 60),
    act: Number(process.env.EXPOSURE_ACT ?? 80),
  },
  ...(process.env.CREW_SHARED_SECRET ? { crewToken: process.env.CREW_SHARED_SECRET } : {}),
  ...(process.env.SIM_FRAME_DIR ? { frameDirectory: process.env.SIM_FRAME_DIR } : {}),
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
await app.listen({ host: '127.0.0.1', port });
console.log(`Spotter API: http://127.0.0.1:${port}`);
