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
export interface CombinedAlertState { belowSince: number | null; lastAt: number; active: boolean }
/** Low energy must be continuous; missing samples (>5s) or recovery restart the hold. */
export function advanceCombinedAlert(previous: CombinedAlertState | null, input: { now: number; energy: number | null; exposure: number | null; available: boolean; threshold: number }): CombinedAlertState {
  const { now, energy, exposure, available, threshold } = input;
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) throw new Error('Invalid ENERGY_ALERT_THRESHOLD');
  const low = Number.isFinite(now) && energy !== null && Number.isFinite(energy) && energy >= 0 && energy < threshold;
  const continuous = previous && now >= previous.lastAt && now - previous.lastAt <= 5000;
  const belowSince = low ? (continuous ? previous.belowSince ?? now : now) : null;
  return { belowSince, lastAt: now, active: belowSince !== null && now - belowSince >= 30_000 && available && exposure !== null && Number.isFinite(exposure) && exposure >= 60 };
}
