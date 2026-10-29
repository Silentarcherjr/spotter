import { linkLocalCrew } from './crew-local-config.ts';
try {
  const identities = await Promise.all([3210, 3220].map(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error('Both local instances must be running');
    const value = await response.json() as { twitch?: { connected?: boolean; broadcasterId?: string | null } };
    if (!value.twitch?.connected || !value.twitch.broadcasterId) throw new Error('Authorize both Twitch accounts before linking');
    return value.twitch.broadcasterId;
  }));
  await linkLocalCrew('data/crew', identities[0]!, identities[1]!);
  console.log('Reciprocal private crew configuration saved. Restart both crew instances to load it. No secret displayed.');
} catch (error) { console.error(error instanceof Error ? error.message : 'Local crew linking unavailable'); process.exitCode = 1; }
