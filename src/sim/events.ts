export function createSimEvent<T extends Record<string, unknown>>(
  enabled: boolean,
  kind: string,
  data: T,
): Omit<T, 'simulated' | 'kind'> & { kind: string; simulated: true } {
  if (!enabled) throw new Error('Simulation requires SIM=1');
  return { ...data, kind, simulated: true };
}
