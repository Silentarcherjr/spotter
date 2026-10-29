import { execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { parseVisionFrameWidth } from '../config.ts';
const execFile = promisify(callback);

export async function* videoFrames(path: string, options: { frameWidth?: number; intervalSeconds: number; maxFrames: number }) {
  if (!Number.isFinite(options.intervalSeconds) || options.intervalSeconds < 1 || !Number.isInteger(options.maxFrames) || options.maxFrames < 1 || options.maxFrames > 10_000) throw new Error('Use an interval >=1 second and 1–10000 maximum frames');
  const frameWidth = parseVisionFrameWidth(options.frameWidth);
  const input = resolve(path);
  let duration: number;
  try {
    const result = await execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input], { timeout: 15_000, maxBuffer: 16_384 });
    duration = Number(result.stdout.trim());
  } catch { throw new Error('Cannot read video. Verify a local clip and installed ffmpeg/ffprobe.'); }
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Video has no finite duration');
  for (let index = 0; index < options.maxFrames && index * options.intervalSeconds < duration; index++) {
    const seconds = index * options.intervalSeconds;
    let image: Buffer;
    try {
      const result = await execFile('ffmpeg', ['-nostdin', '-loglevel', 'error', '-ss', String(seconds), '-i', input, '-an', '-sn', '-frames:v', '1', '-vf', `scale=${frameWidth}:-2`, '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'], { encoding: 'buffer', maxBuffer: 2_000_000, timeout: 20_000 });
      image = result.stdout;
    } catch { throw new Error('Video frame extraction unavailable'); }
    if (image[0] !== 0xff || image[1] !== 0xd8 || image.at(-2) !== 0xff || image.at(-1) !== 0xd9) throw new Error('Video frame extraction returned no JPEG');
    yield { at: Math.round(seconds * 1000), durationMs: Math.round(duration * 1000), image: `data:image/jpeg;base64,${image.toString('base64')}`, simulated: true as const };
  }
}
