import type { Partner } from '../../core/tagout.ts';
export interface CrewPeer {
  id: string;
  endpoint: string;
  token: string;
}
export function parseCrewConfig(value: unknown): CrewPeer[] {
  if (!Array.isArray(value) || value.length > 5)
    throw new Error('Crew must contain at most five local peers');
  const ids = new Set<string>();
  return value.map((peer: unknown) => {
    if (!peer || typeof peer !== 'object') throw new Error('Invalid crew peer');
    const entry = peer as CrewPeer;
    if (
      typeof entry.id !== 'string' ||
      !entry.id ||
      ids.has(entry.id) ||
      typeof entry.token !== 'string' ||
      !entry.token
    )
      throw new Error('Invalid crew identity');
    const url = new URL(entry.endpoint);
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/api/crew/status' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Crew endpoints must use loopback /api/crew/status');
    ids.add(entry.id);
    return { id: entry.id, endpoint: url.toString(), token: entry.token };
  });
}
export async function pollCrew(
  peers: readonly CrewPeer[],
  fetcher: typeof fetch = fetch,
): Promise<Partner[]> {
  const result = await Promise.all(
    peers.map(async (peer): Promise<Partner | null> => {
      try {
        const response = await fetcher(peer.endpoint, {
          headers: { Authorization: `Bearer ${peer.token}` },
          signal: AbortSignal.timeout(3_000),
          redirect: 'error',
        });
        if (!response.ok) return null;
        const value = (await response.json()) as { live?: boolean; energy?: number };
        if (
          typeof value.live !== 'boolean' ||
          typeof value.energy !== 'number' ||
          !Number.isFinite(value.energy) ||
          value.energy < 0 ||
          value.energy > 100
        )
          return null;
        return { id: peer.id, live: value.live, energy: value.energy };
      } catch {
        return null;
      }
    }),
  );
  return result.filter((partner): partner is Partner => partner !== null);
}
