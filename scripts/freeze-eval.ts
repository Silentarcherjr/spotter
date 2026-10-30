import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { evalFrame } from '../src/media/eval-frame.ts';
const root = 'test/fixtures/eval-temporal';
const labels = JSON.parse(await readFile(`${root}/labels.json`, 'utf8')) as { clips: { id: string }[]; naturalFrames: { id: string; clip: string; seconds: number }[] };
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const clips: Record<string,string> = {}; const frames: Record<string,string> = {};
for (const clip of labels.clips) clips[clip.id] = digest(await readFile(`data/eval/natural/pexels-${clip.id}.mp4`));
for (const frame of labels.naturalFrames) { frames[frame.id] = digest(await evalFrame(`data/eval/natural/pexels-${frame.clip}.mp4`, frame.seconds)); console.log(`Frozen ${frame.id}`); }
for (let i=1;i<=30;i++) { const id=`frame-${String(i).padStart(2,'0')}`; frames[id] = digest(await readFile(`test/fixtures/eval/${id}.png`)); }
const value = { frozenAt: new Date().toISOString(), labelsSha256: digest(await readFile(`${root}/labels.json`)), clips, frames, extractor: '1280:-2 JPEG q:v=2; image2pipe; RAM only', ffmpeg: execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0] };
await writeFile(`${root}/freeze.json`,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
console.log(`Freeze SHA-256 ${digest(await readFile(`${root}/freeze.json`))}`);
