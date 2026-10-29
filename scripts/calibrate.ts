import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseVisionFrameWidth, parseAiTimeoutMs } from '../src/config.ts';
import { ResponsesAI, parseVisionDetail } from '../src/ai/responses.ts';
import { mockVision } from '../src/ai/mock.ts';
import { videoFrames } from '../src/media/local-video.ts';
import { VisionCalibration, calibrationCsv, calibrationHtml } from '../src/modules/offthemap/calibration.ts';

const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
try {
  const video = option('--video') ?? process.env.VISION_VIDEO_PATH;
  if (!video) throw new Error('Provide --video /path/to/clip.mp4 or VISION_VIDEO_PATH in .env');
  const mock = args.includes('--mock');
  if (mock && process.env.SIM !== '1') throw new Error('--mock requires explicit SIM=1');
  const frameWidth = parseVisionFrameWidth(process.env.VISION_FRAME_WIDTH);
  const timeoutMs = parseAiTimeoutMs(process.env.AI_TIMEOUT_MS);
  const detail = parseVisionDetail(process.env.OPENAI_VISION_DETAIL);
  const key = process.env.OPENAI_API_KEY ?? ''; const model = process.env.OPENAI_MODEL ?? '';
  if (!mock && (!key || !model)) throw new Error('Set OPENAI_API_KEY and OPENAI_MODEL in .env for real vision');
  const ai = mock ? null : new ResponsesAI({ key, model, detail, timeoutMs, baseURL: process.env.AI_BASE_URL ?? '' });
  let index = 0;
  const run = new VisionCalibration({ frameWidth, timeoutMs, analyze: (image) => ai ? ai.vision(image) : Promise.resolve(mockVision(index++)), detail, model: mock ? 'mock' : model, mock, thresholds: { warn: Number(process.env.EXPOSURE_WARN ?? 60), act: Number(process.env.EXPOSURE_ACT ?? 80) } });
  const intervalSeconds = Number(option('--interval') ?? 4);
  const maxFrames = Number(option('--max-frames') ?? 120);
  let durationMs = 0;
  console.log(`SIMULATED · ${mock ? 'MOCK VISION' : 'REAL VISION'} · sampled input only · no OBS/Twitch actions`);
  for await (const frame of videoFrames(video, { intervalSeconds, maxFrames, frameWidth })) {
    durationMs = frame.durationMs;
    await run.sample(frame.image, frame.at);
    const row = run.report().frames.at(-1)!;
    console.log(`Frame ${row.frame} · ${row.at}ms · score ${row.score} · ${row.analysis}${row.failureReason ? ` (${row.failureReason}${row.httpStatus ? `, HTTP ${row.httpStatus}` : ''})` : ''}`);
  }
  const report = run.report();
  const metadata = { sampleIntervalMs: intervalSeconds * 1000, durationMs, capped: report.frames.length < Math.ceil(durationMs / (intervalSeconds * 1000)) };
  const output = resolve(option('--output') ?? 'data/vision-calibration');
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(`${output}.json`, JSON.stringify({ ...report, ...metadata }, null, 2) + '\n', { mode: 0o600 });
  await writeFile(`${output}.csv`, calibrationCsv(report), { mode: 0o600 });
  await writeFile(`${output}.html`, calibrationHtml(report) + `\n<!-- sampled interval ${metadata.sampleIntervalMs}ms; capped=${metadata.capped} -->\n`, { mode: 0o600 });
  console.log(`Private JSON, CSV and HTML score reports written. ${report.successfulFrames} analyzed; ${report.unavailableFrames} unavailable. Limit reached: ${metadata.capped}.`);
} catch (error) { console.error(error instanceof Error ? error.message : 'Calibration unavailable'); process.exitCode = 1; }
