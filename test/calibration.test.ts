import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { VisionCalibration, calibrationCsv, calibrationHtml } from '../src/modules/offthemap/calibration.ts';
import { videoFrames } from '../src/media/local-video.ts';

const execFile = promisify(execFileCallback);
test('video calibration uses media timestamps, real scoring and fail-soft rows without actions or image retention', async () => {
  let failing = false;
  const run = new VisionCalibration({ analyze: async () => { if (failing) throw new Error('private upstream text'); return [{ category: 'transit', severity: 5, confidence: 1 }, { category: 'storefront', severity: 5, confidence: 1 }]; }, detail: 'high', model: 'configured-model', thresholds: { warn: 60, act: 80 }, mock: false });
  await run.sample('data:image/jpeg;base64,AA==', 0);
  failing = true;
  await run.sample('data:image/jpeg;base64,AA==', 4_000);
  const report = run.report();
  assert.equal(report.simulated, true);
  assert.equal(report.vision, 'real');
  assert.equal(report.frameWidth, 1280);
  assert.equal(report.timeoutMs, 15000);
  assert.equal(report.frames[0]?.score, 93);
  assert.deepEqual(report.frames[0]?.wouldRequest, ['privacy', 'marker']);
  assert.equal(report.frames[1]?.score, 93);
  assert.equal(report.frames[1]?.analysis, 'analysis unavailable');
  assert.deepEqual(report.frames[1]?.wouldRequest, []);
  assert.doesNotMatch(JSON.stringify(report), /base64|private upstream text/);
  assert.match(calibrationCsv(report), /4000,93,analysis unavailable/);
  assert.match(calibrationHtml(report), /SIMULATED/);
  await assert.rejects(run.sample('data:image/jpeg;base64,AA==', 3_000));
});

test('local video CLI extracts sampled JPEGs in memory and writes score reports only', { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'spotter-calibration-'));
  try {
    const clip = join(directory, 'fixture.mp4');
    await execFile('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10', '-t', '8', '-c:v', 'mpeg4', '-y', clip]);
    const frames = [];
    for await (const frame of videoFrames(clip, { intervalSeconds: 4, maxFrames: 2 })) {
      assert.equal(frame.simulated, true);
      assert.match(frame.image, /^data:image\/jpeg;base64,/);
      const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'json', '-i', 'pipe:0'], { input: Buffer.from(frame.image.split(',')[1]!, 'base64'), encoding: 'utf8' });
      assert.equal(JSON.parse(probe.stdout).streams[0].width, 1280);
      frames.push(frame.at);
    }
    assert.deepEqual(frames, [0, 4000]);
    for await (const frame of videoFrames(clip, { intervalSeconds: 4, maxFrames: 1, frameWidth: 640 })) {
      const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'json', '-i', 'pipe:0'], { input: Buffer.from(frame.image.split(',')[1]!, 'base64'), encoding: 'utf8' });
      assert.equal(JSON.parse(probe.stdout).streams[0].width, 640);
    }
    const output = join(directory, 'report');
    await execFile(process.execPath, ['--experimental-strip-types', 'scripts/calibrate.ts', '--video', clip, '--output', output, '--interval', '4', '--max-frames', '2', '--mock'], { env: { ...process.env, SIM: '1' } });
    const report = JSON.parse(await readFile(`${output}.json`, 'utf8')) as { frames: { score: number }[]; vision: string };
    assert.equal(report.frames.length, 2);
    assert.equal(report.vision, 'mock');
    assert.ok(report.frames[1]!.score > report.frames[0]!.score);
    assert.deepEqual((await readdir(directory)).toSorted(), ['fixture.mp4', 'report.csv', 'report.html', 'report.json']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
