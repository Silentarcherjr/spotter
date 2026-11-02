import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { qrFixture } from '../test/helpers/qr.ts';
await mkdir('data/takes/qr-guard', { recursive: true });
const moving = process.argv.includes('--moving');
const image = qrFixture({
  width: moving ? 360 : 1280,
  height: moving ? 360 : 720,
  size: 240,
  payload: 'TEST-ONLY',
});
const output = moving ? 'data/takes/qr-guard/motion-loop.mp4' : 'data/takes/qr-guard/test-loop.mp4';
const child = spawn(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x25324a:s=1280x720:r=30:d=6',
    '-f',
    'image2pipe',
    '-vcodec',
    'png',
    '-i',
    'pipe:0',
    '-filter_complex',
    moving
      ? "[0:v][1:v]overlay=x='(W-w)/2+180*sin(2*PI*t)':y='(H-h)/2+60*cos(PI*t)':enable='between(t,2,3)':eof_action=repeat[out]"
      : "[0:v][1:v]overlay=0:0:enable='between(t,2,3)':eof_action=repeat[out]",
    '-map',
    '[out]',
    '-t',
    '6',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    output,
  ],
  { stdio: ['pipe', 'ignore', 'pipe'] },
);
child.stderr.on('data', () => {});
child.stdin.end(image);
const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
if (code !== 0) throw Error('QR fixture rendering unavailable');
console.log(
  'Created silent6s synthetic clip: QR TEST-ONLY visible from2s to3s; no captured frame saved.',
);
