export interface ChatActivity { id: string; userId: string; at: number }
export function chatVelocity(events: readonly ChatActivity[], now: number): { messagesPerMinute: number; uniqueChattersPerMinute: number } {
  const unique = new Map(events.filter((event) => event.at > now - 60_000 && event.at <= now).map((event) => [event.id, event]));
  return { messagesPerMinute: unique.size, uniqueChattersPerMinute: new Set([...unique.values()].map((event) => event.userId)).size };
}
export function correlation(pairs: readonly { energy: number; chat: number }[]): number | null {
  const valid = pairs.filter((pair) => Number.isFinite(pair.energy) && Number.isFinite(pair.chat));
  if (valid.length < 3) return null;
  const energyMean = valid.reduce((sum, pair) => sum + pair.energy, 0) / valid.length;
  const chatMean = valid.reduce((sum, pair) => sum + pair.chat, 0) / valid.length;
  const covariance = valid.reduce((sum, pair) => sum + (pair.energy - energyMean) * (pair.chat - chatMean), 0);
  const energyVariance = valid.reduce((sum, pair) => sum + (pair.energy - energyMean) ** 2, 0);
  const chatVariance = valid.reduce((sum, pair) => sum + (pair.chat - chatMean) ** 2, 0);
  return energyVariance && chatVariance ? covariance / Math.sqrt(energyVariance * chatVariance) : null;
}
export const combinedAlert = (energy: number | null, exposure: number | null, available: boolean): boolean => available && energy !== null && exposure !== null && Number.isFinite(energy) && Number.isFinite(exposure) && energy <= 30 && exposure >= 60;
