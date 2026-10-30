import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTake } from './telemetry.ts';
import type { RecordedTake } from './telemetry.ts';
const catalog = [
  ['measured-energy', 'Measured audio · processed input', 'secondwind-three-parts-2026-10-29/processed-f32.json'],
  ['combined-alert', 'Measured combined alert', 'secondwind-three-parts-2026-10-29/combined-visual-loop.json'],
  ['relay-round-trip', 'Real Twitch relay · round trip', 'tagout-resume-2026-10-29/relay-status.json'],
] as const;
export async function loadRecordedTakes(root: string): Promise<RecordedTake[]> {
  const takes: RecordedTake[] = [];
  for (const [id, label, path] of catalog) {
    try {
      const file = join(root, path); if ((await stat(file)).size > 20_000_000) continue;
      const take = parseTake(JSON.parse(await readFile(file, 'utf8')) as unknown, id, label);
      if (take.points.some(p => p.energy !== null)) takes.push(take);
    } catch { /* Missing/malformed evidence is not replaced with invented measurements. */ }
  }
  return takes;
}
