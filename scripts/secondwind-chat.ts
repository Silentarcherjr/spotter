import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { sendSecondWindChat } from '../src/twitch/proof.ts';
try {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) throw new Error('Twitch not configured');
  const receipts = await sendSecondWindChat({ clientId: process.env.TWITCH_CLIENT_ID, clientSecret: process.env.TWITCH_CLIENT_SECRET, redirectUri: process.env.TWITCH_REDIRECT_URI ?? 'http://localhost:3210/api/twitch/callback' }, process.env.DATABASE_PATH ?? 'data/spotter.sqlite');
  const output = process.argv[2] ?? 'data/takes/secondwind/real-chat-receipts.json';
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(receipts, null, 2) + '\n', { mode: 0o600 });
} catch { console.error('Controlled Twitch chat unavailable; no credentials displayed.'); process.exitCode = 1; }
