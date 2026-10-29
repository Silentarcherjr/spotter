import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const seconds = Number(process.argv[2] ?? 1800);
const output = resolve(process.argv[3] ?? 'data/takes/tagout-2026-10-29/relay-status.json');
if (!Number.isInteger(seconds) || seconds < 1 || seconds > 7200) throw new Error('Use1–7200 seconds');
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
const rows: unknown[] = []; let previous = '';
const began = Date.now();
while (Date.now() - began < seconds * 1000) {
  const instances = await Promise.all([3210, 3220].map(async (port) => {
    try {
      const [statusResponse, overlayResponse] = await Promise.all([fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(3000) }), fetch(`http://127.0.0.1:${port}/api/overlay`, { signal: AbortSignal.timeout(3000) })]);
      const s = await statusResponse.json(); const overlay = await overlayResponse.json();
      return { port, health: statusResponse.status, broadcasterId: s.twitch?.broadcasterId, live: s.twitch?.live, twitchConnected: s.twitch?.connected, energy: s.energy, audioSimulated: s.audioSimulated, sensorStatus: s.sensorStatus, crew: Array.isArray(s.crew) ? s.crew.map((p: { id: string; live: boolean; energy: number }) => ({ id: p.id, live: p.live, energy: p.energy })) : [], tagout: { phase: s.tagout?.phase, homeId: s.tagout?.homeId, partnerId: s.tagout?.partnerId, returning: s.tagout?.returning, cancelPending: s.tagout?.cancelPending, lowSince: s.tagout?.lowSince }, countdownSeconds: s.countdownSeconds, status: s.status, canApprove: s.canApprove, raidHttpStatus: typeof s.raidHttpStatus === 'number' ? s.raidHttpStatus : null, raidFailure: ['raid_target_restrictions', 'raid_already_pending', 'raid_size_limit'].includes(s.raidFailure) ? s.raidFailure : null, coveringFor: s.coveringFor, overlay: { enabled: overlay.enabled, simulated: overlay.simulated, energy: overlay.energy, phase: overlay.phase, coveringFor: overlay.coveringFor } };
    } catch { return { port, health: 0 }; }
  }));
  const row = { at: Date.now(), instances }; rows.push(row);
  const change = JSON.stringify(instances.map(s => ({ port: s.port, phase: s.tagout?.phase, status: s.status, live: s.live, sensor: s.sensorStatus })));
  if (change !== previous) { console.log(change); previous = change; }
  await writeFile(output, JSON.stringify({ source: 'allowlisted real local instance observations; audio provenance included', rows }, null, 2) + '\n', { mode: 0o600 });
  await new Promise(resolve => setTimeout(resolve, 1000));
}
console.log('Private relay observations saved; no tokens, keys, audio or chat text retained.');
