import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createSimEvent } from './events.ts';

// Existing, user-owned fixtures are read into memory; captured/model frames are never written.
export async function loadFrameFolder(enabled: boolean, directory: string) {
  if (!enabled) throw new Error('Simulation requires SIM=1');
  const mime: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  const names = (await readdir(directory))
    .filter((name) => mime[extname(name).toLowerCase()])
    .toSorted();
  if (!names.length || names.length > 20) throw new Error('Simulation needs 1–20 image fixtures');
  const frames = [];
  let total = 0;
  for (const name of names) {
    const path = join(directory, name);
    const size = (await stat(path)).size;
    total += size;
    if (size > 2_000_000 || total > 20_000_000)
      throw new Error('Simulation fixtures exceed memory limit');
    const bytes = await readFile(path);
    frames.push(
      createSimEvent(true, 'frame_image', {
        image: `data:${mime[extname(name).toLowerCase()]};base64,${bytes.toString('base64')}`,
      }),
    );
  }
  return frames;
}
