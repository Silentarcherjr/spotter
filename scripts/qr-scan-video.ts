import { spawn, execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, basename, extname } from 'node:path';
import { PNG } from 'pngjs';
import { detectQr } from '../src/qr/detector.ts';
import { distribution } from '../src/observability/metrics.ts';
const execFile = promisify(callback),
  input = resolve(process.argv[2] ?? ''),
  width = Number(process.argv[3] ?? 1280),
  fps = 5;
if (
  !['.mp4', '.mov', '.mkv'].includes(extname(input).toLowerCase()) ||
  ![1280, 1920].includes(width)
)
  throw Error('Expected local video and width1280 or1920');
const hash = createHash('sha256');
for await (const bytes of createReadStream(input)) hash.update(bytes);
const sha256 = hash.digest('hex');
const { stdout } = await execFile('ffprobe', [
  '-v',
  'error',
  '-select_streams',
  'v:0',
  '-show_entries',
  'stream=width,height',
  '-show_entries',
  'format=duration',
  '-of',
  'json',
  input,
]);
const meta = JSON.parse(stdout) as {
  streams: { width: number; height: number }[];
  format: { duration: string };
};
const source = meta.streams[0]!;
const height = Math.floor(((source.height / source.width) * width) / 2) * 2;
const size = width * height * 4;
const frame = Buffer.alloc(size);
let filled = 0;
const child = spawn(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input,
    '-an',
    '-sn',
    '-vf',
    `fps=${fps},scale=${width}:${height}`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    'pipe:1',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
child.stderr.on('data', () => {});
const rows: {
  nominalSeconds: number;
  detected: boolean | null;
  detectorMs: number;
  box: unknown;
}[] = [];
for await (const bytes of child.stdout) {
  const chunk = bytes as Buffer;
  let position = 0;
  while (position < chunk.length) {
    const count = Math.min(size - filled, chunk.length - position);
    chunk.copy(frame, filled, position, position + count);
    filled += count;
    position += count;
    if (filled === size) {
      const png = new PNG({ width, height });
      png.data = frame;
      const image = PNG.sync.write(png, { deflateLevel: 0 });
      const start = performance.now();
      let detected: boolean | null = null,
        box: unknown = null;
      try {
        const observation = detectQr(image);
        detected = observation.detected;
        box = observation.box;
      } catch {}
      rows.push({
        nominalSeconds: rows.length / fps,
        detected,
        detectorMs: performance.now() - start,
        box,
      });
      filled = 0;
    }
  }
}
const code = await new Promise<number | null>((r) =>
  child.exitCode !== null ? r(child.exitCode) : child.on('exit', r),
);
if (code !== 0 || filled) throw Error('Video scan incomplete');
const result = {
  source: basename(input),
  sha256,
  width,
  height,
  fps,
  durationSeconds: Number(meta.format.duration),
  frames: rows.length,
  detectedFrames: rows.filter((r) => r.detected === true).length,
  unavailable: rows.filter((r) => r.detected === null).length,
  timing: distribution(rows.map((r) => r.detectorMs)),
  payloadDecoded: false,
  labelsFixed: false,
  notes:
    'Local screening only, not precision/recall: no per-frame ground truth yet. Nominal sampling timestamps. No images written, no AI, no QR text read or retained.',
  rows,
};
await mkdir('data/takes/qr-guard', { recursive: true });
const output = `data/takes/qr-guard/user-${basename(input).replace(/[^a-zA-Z0-9_-]/g, '-')}-${width}.json`;
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ ...result, rows: undefined, output }));
