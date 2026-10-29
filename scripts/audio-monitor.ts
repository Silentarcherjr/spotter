import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
try {
  const seconds = Number(option('--seconds') ?? 900);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error('Use 1–3600 seconds');
  const output = resolve(option('--output') ?? 'data/takes/secondwind/audio-monitor');
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const rows: Record<string, unknown>[] = [];
  const began = Date.now(); let lastLog = '';
  while (Date.now() - began < seconds * 1000) {
    const r = await fetch('http://127.0.0.1:3210/api/status', { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error('Local status unavailable');
    const s = await r.json() as { audioSource?: string; audioSimulated?: boolean; calibrated: boolean; calibration: number; energy: number | null; sensorStatus: string; chat: { messagesPerMinute: number; uniqueChattersPerMinute: number }; twitch: { connected: boolean }; correlation: number | null; combinedAlert: boolean; exposure: { score: number }; analysis: string };
    const row = { at: Date.now(), source: s.audioSource, simulated: s.audioSimulated, calibrated: s.calibrated, calibration: s.calibration, energy: s.energy, sensorStatus: s.sensorStatus, chat: s.chat.messagesPerMinute, uniqueChatters: s.chat.uniqueChattersPerMinute, twitchConnected: s.twitch.connected, correlation: s.correlation, exposure: s.exposure.score, visionAnalysis: s.analysis, combinedAlert: s.combinedAlert };
    rows.push(row);
    const log = JSON.stringify({ source: row.source, simulated: row.simulated, calibrationPercent: Math.floor(row.calibration * 100), energy: row.energy, sensorStatus: row.sensorStatus, chat: row.chat, correlation: row.correlation, combinedAlert: row.combinedAlert });
    if (log !== lastLog && (rows.length % 5 === 1 || row.calibrated && args.includes('--until-calibrated'))) { console.log(log); lastLog = log; }
    await writeFile(`${output}.json`, JSON.stringify({ source: 'local numeric status observations', rows }, null, 2) + '\n', { mode: 0o600 });
    if (row.calibrated && row.source === 'file' && args.includes('--until-calibrated')) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const keys = Object.keys(rows[0] ?? {});
  await writeFile(`${output}.csv`, [keys.join(','), ...rows.map((row) => keys.map((key) => row[key] ?? '').join(','))].join('\n') + '\n', { mode: 0o600 });
  console.log('Private numeric JSON/CSV written. No audio or message text retained.');
} catch (error) { console.error(error instanceof Error ? error.message : 'Audio monitoring unavailable'); process.exitCode = 1; }
