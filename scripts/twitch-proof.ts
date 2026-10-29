import { writeFile } from 'node:fs/promises';
import { twitchProof } from '../src/twitch/proof.ts';
try {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) throw new Error('Twitch credentials are not configured');
  const capture = process.argv.includes('--capture-chat');
  const proof = await twitchProof({ clientId: process.env.TWITCH_CLIENT_ID, clientSecret: process.env.TWITCH_CLIENT_SECRET, redirectUri: process.env.TWITCH_REDIRECT_URI ?? 'http://localhost:3210/api/twitch/callback' }, process.env.DATABASE_PATH ?? 'data/spotter.sqlite', capture, process.argv.includes('--send-test'));
  if (capture) { await writeFile('test/fixtures/twitch/channel.chat.message.json', JSON.stringify(proof, null, 2) + '\n'); console.log('Controlled live chat fixture saved with all identities/text redacted.'); }
  else console.log(JSON.stringify(proof));
} catch { console.error('Twitch proof unavailable; verify authorization and retry. No credentials displayed.'); process.exitCode = 1; }
