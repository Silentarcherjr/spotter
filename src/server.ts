import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from './app.ts';

const databasePath = process.env.DATABASE_PATH ?? 'data/spotter.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const port = Number(process.env.PORT ?? 3210);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const app = createApp({ databasePath, simulated: process.env.SIM === '1', ...(process.env.SIM_FRAME_DIR ? { frameDirectory: process.env.SIM_FRAME_DIR } : {}) });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close(); });
}
await app.listen({ host: '127.0.0.1', port });
console.log(`Spotter API: http://127.0.0.1:${port}`);
