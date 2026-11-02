import { correlation } from '../core/chat.ts';
export interface TelemetryPoint {
  at: number;
  energy: number | null;
  chat: number | null;
}
export interface TelemetryEvent {
  at: number;
  label: string;
  kind: 'alert' | 'privacy' | 'relay';
}
export interface RecordedTake {
  id: string;
  label: string;
  recorded: true;
  simulated: boolean;
  points: TelemetryPoint[];
  events: TelemetryEvent[];
}
export const elapsedTime = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const numeric = (v: unknown, max = Infinity): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
export function summarizeTelemetry(points: readonly TelemetryPoint[]) {
  const ordered = points.filter((p) => Number.isFinite(p.at)).toSorted((a, b) => a.at - b.at);
  const energies = ordered.filter(
    (p): p is TelemetryPoint & { energy: number } => numeric(p.energy, 100) !== null,
  );
  const chats = ordered.filter(
    (p): p is TelemetryPoint & { chat: number } => numeric(p.chat) !== null,
  );
  const pairs = energies.filter(
    (p): p is { at: number; energy: number; chat: number } => numeric(p.chat) !== null,
  );
  const change = (values: number[]) =>
    values[0] && values.at(-1) !== undefined
      ? ((values.at(-1)! - values[0]) / values[0]) * 100
      : null;
  return {
    n: pairs.length,
    correlation: pairs.length >= 20 ? correlation(pairs) : null,
    peak: energies.reduce<(typeof energies)[number] | null>(
      (a, b) => (!a || b.energy > a.energy ? b : a),
      null,
    ),
    low: energies.reduce<(typeof energies)[number] | null>(
      (a, b) => (!a || b.energy < a.energy ? b : a),
      null,
    ),
    energyChangePercent: change(energies.map((p) => p.energy)),
    chatChangePercent: change(chats.map((p) => p.chat)),
    start: ordered[0]?.at ?? 0,
    end: ordered.at(-1)?.at ?? 0,
  };
}
// Closed projection: never return raw take rows, chat text, account IDs or action receipts.
export function parseTake(input: unknown, id: string, label: string): RecordedTake {
  const rows = (input as { rows?: unknown[] } | null)?.rows;
  const points: TelemetryPoint[] = [];
  const events: TelemetryEvent[] = [];
  let alert = false;
  let privacy = false;
  let phase = '';
  let simulated = false;
  const ordered = (Array.isArray(rows) ? rows : [])
    .filter(
      (v): v is Record<string, unknown> =>
        !!v && typeof v === 'object' && Number.isFinite((v as { at: number }).at),
    )
    .toSorted((a, b) => Number(a.at) - Number(b.at));
  for (const row of ordered.slice(0, 30_000)) {
    const source = (Array.isArray(row.instances) ? row.instances[0] : row) as
      Record<string, unknown> | undefined;
    if (!source) continue;
    const at = Number(row.at);
    const energy = numeric(source.energy, 100);
    const chat = numeric(source.chat);
    if (points.at(-1)?.at !== at) points.push({ at, energy, chat });
    simulated ||= source.simulated === true || source.audioSimulated === true;
    const nextAlert = source.combinedAlert === true;
    const nextPrivacy = source.privacyActive === true;
    if (nextAlert && !alert) events.push({ at, label: 'Combined alert', kind: 'alert' });
    if (nextPrivacy && !privacy) events.push({ at, label: 'Privacy', kind: 'privacy' });
    const nextPhase = (source.tagout as { phase?: string } | undefined)?.phase ?? '';
    const labels: Record<string, string> = {
      suggested: 'Tag out suggested',
      raiding: 'Raid pending',
      covered: 'Relay confirmed',
      home: 'Home confirmed',
    };
    if (nextPhase !== phase && labels[nextPhase])
      events.push({ at, label: labels[nextPhase]!, kind: 'relay' });
    alert = nextAlert;
    privacy = nextPrivacy;
    phase = nextPhase;
  }
  return { id, label, recorded: true, simulated, points, events };
}
