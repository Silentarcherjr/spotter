import { mkdir, writeFile } from 'node:fs/promises';
import { retireLocalRelay } from '../src/twitch/proof.ts';
try {
  for (const port of [3210, 3220]) {
    let running = false;
    try { running = (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Expected while stopped. */ }
    if (running) throw new Error('Stop both Spotter instances before retiring the previous cycle');
  }
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) throw new Error('Twitch app configuration required');
  const receipts = [];
  for (const [path, port] of [['data/spotter.sqlite', 3210], ['data/crew/secondary.sqlite', 3220]] as const) receipts.push(await retireLocalRelay({ clientId: process.env.TWITCH_CLIENT_ID, clientSecret: process.env.TWITCH_CLIENT_SECRET, redirectUri: `http://localhost:${port}/api/twitch/callback` }, path));
  await mkdir('data/takes/tagout-resume-2026-10-29', { recursive: true, mode: 0o700 });
  await writeFile('data/takes/tagout-resume-2026-10-29/previous-cycle-retirement.json', JSON.stringify(receipts, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(receipts));
} catch (error) { console.error(error instanceof Error ? error.message : 'Relay migration unavailable'); process.exitCode = 1; }
