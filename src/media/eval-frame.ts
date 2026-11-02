import { execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(callback);
/** Extract exactly one licensed source frame into RAM; never creates an image file. */
export async function evalFrame(path: string, seconds: number): Promise<Buffer> {
  if (!Number.isFinite(seconds) || seconds < 0) throw Error('Invalid frame time');
  const { stdout } = await execFile(
    'ffmpeg',
    [
      '-nostdin',
      '-loglevel',
      'error',
      '-ss',
      String(seconds),
      '-i',
      path,
      '-an',
      '-sn',
      '-frames:v',
      '1',
      '-vf',
      'scale=1280:-2',
      '-q:v',
      '2',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 2800000, timeout: 20000 },
  );
  if (stdout[0] !== 255 || stdout[1] !== 216 || stdout.at(-2) !== 255 || stdout.at(-1) !== 217)
    throw Error('Frame unavailable');
  return stdout;
}
