import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { benchmarkLatency } from '../src/obs/latency-benchmark.ts';
import { ResponsesAI, parseVisionDetail } from '../src/ai/responses.ts';
import { parseVisionCaptureIntervalMs, parseVisionFrameWidth, parseAiTimeoutMs } from '../src/config.ts';
const controller = new AbortController();
for (const name of ['SIGINT', 'SIGTERM'] as const) process.once(name, () => controller.abort());
const api = 'http://127.0.0.1:3210'; let reconnect = false;
try {
  // Pause only Spotter's connection; never stop OBS outputs. Restore the initial connection state.
  try {
    const state = await (await fetch(`${api}/api/status`)).json() as { connected?: { obs?: boolean } };
    reconnect = state.connected?.obs === true;
    if (reconnect) { const response = await fetch(`${api}/api/obs/disconnect`, { method: 'POST' }); if (!response.ok) throw Error(); }
  } catch { if (reconnect) throw Error('Could not isolate Spotter OBS client'); }
  let fixturePath: string | undefined;
  if (process.argv.includes('--fixture')) {
    await mkdir('data/takes/latency', { recursive: true });
    fixturePath = resolve('data/takes/latency/synthetic-input.mp4');
    const rendered = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-i', 'test/fixtures/eval/frame-21.png', '-t', '12', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fixturePath], { stdio: 'ignore' });
    if (rendered.status !== 0) throw Error('Fixture rendering unavailable');
  }
  if (process.env.OBS_BLUR_FILTER) throw Error('Controlled benchmark requires scene privacy');
  const model = process.env.OPENAI_MODEL ?? '';
  const detail = parseVisionDetail(process.env.OPENAI_VISION_DETAIL);
  const ai = new ResponsesAI({ key: process.env.OPENAI_API_KEY ?? '', model, detail, baseURL: process.env.AI_BASE_URL ?? '', timeoutMs: parseAiTimeoutMs(process.env.AI_TIMEOUT_MS) });
  const result = await benchmarkLatency({ url: process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455', password: process.env.OBS_WEBSOCKET_PASSWORD ?? '', privacyScene: process.env.OBS_PRIVACY_SCENE ?? 'Privacy', frameWidth: parseVisionFrameWidth(process.env.VISION_FRAME_WIDTH), ...(process.env.OBS_SOURCE ? { source: process.env.OBS_SOURCE } : {}) }, ai, parseVisionCaptureIntervalMs(process.env.VISION_CAPTURE_INTERVAL_MS), 10, (trial, sceneMs) => console.log(`Trial ${trial}/10 · scene ${sceneMs === null ? 'unconfirmed' : `${Math.round(sceneMs)} ms`}`), fixturePath, controller.signal);
  await mkdir('data/takes/latency', { recursive: true });
  await writeFile('data/takes/latency/latest.json', JSON.stringify({ ...result, model, detail }, null, 2)+'\n', { mode: 0o600 });
  console.log(JSON.stringify({ scene: result.scene, analysisPerTrialMedians: result.analysisPerTrialMedians, unavailable: result.unavailable }));
} catch { console.error('Latency benchmark unavailable; no credentials or frames displayed.'); process.exitCode = 1; }
finally { if (reconnect) await fetch(`${api}/api/obs/reconnect`, { method: 'POST' }).catch(() => {}); }
