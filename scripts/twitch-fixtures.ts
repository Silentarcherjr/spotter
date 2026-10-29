import { execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
const execFile = promisify(callback);
try {
  await mkdir('test/fixtures/twitch', { recursive: true });
  for (const [type, from, to, timestamp] of [
    ['channel.raid', '200', '100', '2026-10-29T12:00:00Z'],
    ['stream.online', '100', '100', '2026-10-29T12:00:00Z'],
    ['stream.offline', '100', '100', '2026-10-29T12:00:02Z'],
  ] as const) {
    const { stdout } = await execFile('twitch', ['event', 'trigger', type, '--no-config', '--from-user', from, '--to-user', to, '--event-id', `fixture-${type}`, '--subscription-id', `fixture-${type}-sub`, '--timestamp', timestamp], { timeout: 10000 });
    const payload = JSON.parse(stdout) as { subscription: { type: string }; event: unknown };
    if (payload.subscription.type !== type || !payload.event) throw new Error('Invalid CLI fixture');
    await writeFile(`test/fixtures/twitch/${type}.json`, JSON.stringify(payload, null, 2) + '\n');
    console.log(`Generated ${type} with Twitch CLI (mock, no live channel action)`);
  }
} catch { console.error('CLI fixture generation unavailable; install Twitch CLI and retry.'); process.exitCode = 1; }
