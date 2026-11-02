import {parseQrConfig} from './core/qr.ts';
import type {QrConfig} from './core/qr.ts';
import {PrivacyCoordinator} from './modules/privacy.ts';
import {QrGuard} from './modules/qrguard/runtime.ts';
import {QrSensor} from './qr/sensor.ts';
import {detectQr} from './qr/detector.ts';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { loadRecordedTakes } from './presentation/takes.ts';
import type { TelemetryEvent } from './presentation/telemetry.ts';
import websocket from '@fastify/websocket';
import { DatabaseSync } from 'node:sqlite';
import { DemoSession } from './sim/session.ts';
import { loadFrameFolder } from './sim/frames.ts';
import { fileURLToPath } from 'node:url';
import { TwitchRuntime } from './twitch/runtime.ts';
import type { TwitchConfig } from './twitch/auth.ts';
import { ObsClient } from './obs/client.ts';
import type { ObsConfig, ObsWire } from './obs/client.ts';
import { ResponsesAI } from './ai/responses.ts';
import type { AIConfig } from './ai/responses.ts';
import { OffTheMap } from './modules/offthemap/runtime.ts';
import { ChatGuard } from './modules/offthemap/chat-guard.ts';
import { initialTagOut } from './core/tagout.ts';
import { SecondWind, parseNumericFeatures } from './modules/secondwind/runtime.ts';
import { advanceCombinedAlert } from './core/chat.ts';
import { parseVisionCaptureIntervalMs, parseEnergyAlertThreshold, parseTagOutEnergyThreshold, parseTagOutSustainS } from './config.ts';
import { sessionReport } from './core/session.ts';
import { TagOut } from './modules/tagout/runtime.ts';
import { pollCrew } from './modules/tagout/crew.ts';
import type { CrewPeer } from './modules/tagout/crew.ts';

export function createApp(options: { databasePath: string; simulated: boolean; visionCaptureIntervalMs?: number; chatAutoDelete?: boolean; qr?: QrConfig; frameDirectory?: string; demoDisplayName?: string; twitch?: TwitchConfig; obs?: ObsConfig; obsWire?: ObsWire; ai?: AIConfig; crew?: readonly CrewPeer[]; crewToken?: string; energyAlertThreshold?: number; tagoutPolicy?: { energyThreshold: number; sustainSeconds: number }; exposureThresholds?: { warn: number; act: number } }) {
  const visionCaptureIntervalMs = parseVisionCaptureIntervalMs(options.visionCaptureIntervalMs);
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  app.register(websocket, { options: { maxPayload: 2048 }, preClose(done) {
    for (const client of this.websocketServer.clients) client.terminate();
    done();
  } });
  const energyAlertThreshold = parseEnergyAlertThreshold(options.energyAlertThreshold);
  const tagoutPolicy = { energyThreshold: parseTagOutEnergyThreshold(options.tagoutPolicy?.energyThreshold), sustainMs: parseTagOutSustainS(options.tagoutPolicy?.sustainSeconds) * 1000 };
  const database = new DatabaseSync(options.databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const secondwind = !options.simulated ? new SecondWind(database) : null;
  let energyHold: ReturnType<typeof advanceCombinedAlert> | null = null;
  let sensorSocket: { close: () => void } | null = null;
  app.register(async (scope) => {
    scope.get<{ Querystring: { source?: string } }>('/api/sensor', { websocket: true, schema: { querystring: { type: 'object', additionalProperties: false, properties: { source: { type: 'string', enum: ['microphone', 'file'] } } } } }, (socket, request) => {
      if (!secondwind) { socket.close(1008, 'Sensor disabled in simulation'); return; }
      energyHold = null;
      sensorSocket?.close(); sensorSocket = socket;
      secondwind.selectSource(request.query.source === 'file' ? 'file' : 'microphone');
      let lastPacket = 0;
      socket.on('message', (raw: { toString(): string }, binary: boolean) => {
        try {
          const now = Date.now();
          if (sensorSocket !== socket || binary || now - lastPacket < 750) throw new Error('Invalid sensor packet');
          const packet = parseNumericFeatures(JSON.parse(raw.toString()) as unknown, now);
          secondwind.receive(packet); lastPacket = now;
          energyHold = advanceCombinedAlert(energyHold, { now, energy: secondwind.snapshot(now).energy, exposure: null, available: false, threshold: energyAlertThreshold });
          socket.send(JSON.stringify({ accepted: true }));
        } catch { socket.close(1008, 'Numeric features only, at one-second intervals'); }
      });
      socket.on('close', () => { if (sensorSocket === socket) { sensorSocket = null; energyHold = null; } });
    });
  });
  const presentationEvents: TelemetryEvent[] = [];
  let combinedWasActive = false;
  const takes = loadRecordedTakes('data/takes');
  let demoPaused = false;
  let demo = options.simulated ? new DemoSession(true, energyAlertThreshold, tagoutPolicy) : null;
  const twitch = !options.simulated && options.twitch ? new TwitchRuntime(database, options.twitch) : null;
  const obs = !options.simulated && options.obs ? new ObsClient(options.obs, options.obsWire) : null;
  const ai = !options.simulated && options.ai ? new ResponsesAI(options.ai) : null;
  const qrConfig=options.qr??parseQrConfig({});
  const privacy=obs?new PrivacyCoordinator({protect:()=>obs.applyPrivacy(),restore:()=>obs.restore()}):null;
  const marker=async()=>{const id=twitch?.auth.identity?.userId;if(twitch&&id)return twitch.helix.marker(id);throw Error('Twitch unavailable');};
  const qr=obs&&privacy&&qrConfig.enabled?new QrGuard(qrConfig,database,{protect:()=>privacy.hold('qr_guard',true),confirm:()=>obs.confirmPrivacy(),available:()=>obs.connected,release:()=>privacy.hold('qr_guard',false),marker}):null;
  const qrSensor=qr&&obs?new QrSensor({capture:async()=>{await obs.prepareQr(qrConfig.source,qrConfig.renderDelayMs);return obs.capturePng(qrConfig.source,qrConfig.frameWidth);},observe:(value,timing)=>qr.observe(value,timing),unavailable:()=>qr.unavailable()},qrConfig.intervalMs):null;
  const offthemap = obs && ai ? new OffTheMap({ available: () => obs.connected, capture: async () => { if(!qr)return obs.capture(); if(qr.snapshot().active)throw Error('QR preflight unavailable'); const image=await obs.captureVisionPng(); if(detectQr(image).detected)throw Error('QR frame withheld'); return `data:image/png;base64,${image.toString('base64')}`; }, analyze: (frame) => ai.vision(frame), privacy: () => privacy!.hold('offthemap',true), confirmPrivacy: () => obs.confirmPrivacy(), restore: () => privacy!.hold('offthemap',false), marker: async () => {
    const id = twitch?.auth.identity?.userId;
    if (twitch && id) return twitch.helix.marker(id);
    throw new Error('Twitch unavailable');
  } }, options.exposureThresholds) : null;
  const guard = ai && twitch ? new ChatGuard(database, { classify: (message) => ai.classifyChat(message), remove: async (id) => {
    const user = twitch.auth.identity?.userId;
    if (!user) throw new Error('Twitch authorization required');
    return twitch.helix.deleteMessage(user, user, id);
  }, notify: async (_id) => { /* The private dashboard displays the persisted audit as the mod notice. */ } }, { autoDelete: options.chatAutoDelete === true }) : null;
  if (secondwind) twitch?.setActivityHandler((id, at, userId) => secondwind.chat(id, at, userId));
  if (guard) twitch?.setChatHandler((id, message, at) => guard.check(id, message, at));
  const tagout = twitch ? new TagOut(database, {
    identity: () => { const id = twitch.auth.identity?.userId; return id ? { broadcasterId: id, tokenOwnerId: id, sourceLive: twitch.snapshot().live === true } : null; },
    live: async (id) => (await twitch.helix.streams(id)).data.some((stream) => stream.user_id === id && stream.type === 'live'),
    start: (from, to) => twitch.helix.startRaid(from, to), cancel: (id) => twitch.helix.cancelRaid(id),
    knownIds: (options.crew ?? []).map((peer) => peer.id),
  }, tagoutPolicy) : null;
  twitch?.setRaidHandler((from, to, at) => { const previous = tagout?.snapshot(at).tagout.phase; tagout?.confirm(from, to, at); const phase = tagout?.snapshot(at).tagout.phase; if (phase !== previous && (phase === 'covered' || phase === 'home')) presentationEvents.push({ at, label: phase === 'home' ? 'Home confirmed' : 'Relay confirmed', kind: 'relay' }); });
  let closing = false;
  let crewBusy = false;
  let crewTimer: ReturnType<typeof setInterval> | undefined;
  const updateCrew = async () => {
    if (closing || crewBusy || !tagout) return;
    crewBusy = true;
    try { const crew = await pollCrew(options.crew ?? []); if (!closing) tagout.update(secondwind?.snapshot(Date.now()).energy ?? null, crew, Date.now()); }
    finally { crewBusy = false; }
  };
  let visionTimer: ReturnType<typeof setInterval> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let hudEnabled = false;
  let frames: Awaited<ReturnType<typeof loadFrameFolder>> = [];
  app.addHook('onReady', async () => {
    await twitch?.start();
    if (obs) void obs.start();
    qrSensor?.start();
    if (tagout) { void updateCrew(); crewTimer = setInterval(() => { void updateCrew(); }, 5_000); crewTimer.unref(); }
    if (offthemap) { visionTimer = setInterval(() => { void offthemap.sample(Date.now()); }, visionCaptureIntervalMs); visionTimer.unref(); }
    if (demo) { frames = await loadFrameFolder(true, options.frameDirectory ?? fileURLToPath(new URL('../test/fixtures/frames', import.meta.url))); demo.tick(); timer = setInterval(() => { if (!demoPaused) demo?.tick(); }, 4_000); timer.unref(); }
  });
  app.addHook('onClose', async () => { closing = true; qrSensor?.stop(); await qr?.stop(); offthemap?.invalidateAnalysis(); clearInterval(timer); clearInterval(visionTimer); clearInterval(crewTimer); twitch?.stop(); await obs?.stop(); database.close(); });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    let hostname = '';
    try { hostname = new URL(`http://${request.headers.host ?? ''}`).hostname; } catch { /* Reject invalid Host. */ }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) return reply.code(403).send({ error: 'Local requests only' });
    if ((!['GET', 'HEAD'].includes(request.method) || request.url === '/api/sensor') && request.headers.origin) {
      const allowed = [`http://127.0.0.1:${process.env.VITE_PORT ?? 5173}`, `http://127.0.0.1:${process.env.PORT ?? 3210}`];
      if (!allowed.includes(request.headers.origin)) return reply.code(403).send({ error: 'Invalid origin' });
    }
  });
  app.get('/api/review/takes', async () => (await takes).map(({ id, label, simulated, points }) => ({ id, label, simulated, samples: points.length })));
  app.get<{ Params: { id: string } }>('/api/review/takes/:id', async (request, reply) => { const take = (await takes).find(take => take.id === request.params.id); return take ?? reply.code(404).send({ error: 'Take unavailable' }); });
  app.get('/api/qr',async()=>qr?.snapshot()??{enabled:false,status:options.simulated?'disabled':'unavailable'});
  app.post('/api/qr/dismiss',async(_request,reply)=>{if(!qr)return reply.code(503).send({error:'QR Guard unavailable'});try{await qr.dismiss();return {dismissed:true};}catch{return reply.code(503).send({error:'QR Guard unavailable'});}});
  app.get('/api/latency', async () => ({ simulated: options.simulated, captureIntervalMs: visionCaptureIntervalMs, endpoint: 'OBS program confirmation; excludes player/encoder/network', live: offthemap?.latency() ?? null, benchmark: readLatencyBenchmark() }));
  app.get('/api/private/frame', async (request, reply) => { if (request.headers['x-spotter-preview'] !== 'private-dashboard') return reply.code(403).send({ error: 'Private dashboard only' }); return offthemap?.preview() ?? null; });
  app.get('/api/overlay', async () => {
    if (!hudEnabled) return { simulated: options.simulated || secondwind?.snapshot(Date.now()).audioSimulated === true, enabled: false };
    if (demo) return { simulated: true, enabled: true, energy: demo.snapshot().energy, phase: demo.snapshot().tagout.phase, returning: demo.snapshot().tagout.returning, rally: demo.snapshot().rally, coveringFor: demo.snapshot().tagout.phase === 'covered' ? options.demoDisplayName?.trim().slice(0, 100) || 'Demo host' : null };
    const energy = secondwind!.snapshot(Date.now());
    return { simulated: energy.audioSimulated, enabled: true, energy: energy.energy, rally: energy.rally, phase: tagout?.snapshot(Date.now()).tagout.phase ?? 'idle', returning: tagout?.snapshot(Date.now()).tagout.returning ?? false, coveringFor: tagout?.snapshot(Date.now()).coveringFor ? await twitch?.resolveDisplayName(tagout.snapshot(Date.now()).coveringFor!) ?? 'Crew streamer' : null };
  });
  app.get('/api/crew/status', async (request, reply) => {
    if (!options.crewToken || request.headers.authorization !== `Bearer ${options.crewToken}` || !secondwind) return reply.code(401).send({ error: 'Crew authorization required' });
    return { live: twitch?.snapshot().live ?? null, energy: secondwind.snapshot(Date.now()).energy };
  });
  for (const action of ['request', 'approve', 'cancel', 'requestBack'] as const) {
    app.post(`/api/relay/${action}`, async (_request, reply) => {
      if (!tagout) return reply.code(503).send({ error: 'Twitch authorization required' });
      await tagout[action](Date.now()); return tagout.snapshot(Date.now());
    });
  }
  app.post('/api/calibration/reset', async () => { energyHold = null; secondwind?.resetCalibration(); return { reset: true }; });
  app.get('/api/report', async () => ({ presentationEvents: demo?.snapshot().presentationEvents ?? [...presentationEvents, ...(offthemap?.snapshot().presentationEvents ?? [])], simulated: options.simulated || secondwind?.snapshot(Date.now()).audioSimulated === true, ...(demo ? sessionReport(demo.snapshot().curves) : secondwind!.report()) }));
  app.post<{ Body: { enabled: boolean } }>('/api/hud', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['enabled'], properties: { enabled: { type: 'boolean' } } } },
  }, async (request) => { hudEnabled = request.body.enabled; return { enabled: hudEnabled }; });
  if (demo) {
    app.post<{ Body: { paused: boolean } }>('/api/demo/playback', { schema: { body: { type: 'object', required: ['paused'], additionalProperties: false, properties: { paused: { type: 'boolean' } } } } }, async (request) => { demoPaused = request.body.paused; return { paused: demoPaused }; });
    app.post('/api/demo/step', async (_request, reply) => { if (!demoPaused) return reply.code(409).send({ error: 'Pause demo playback first' }); demo!.tick(); return demo!.snapshot(); });
    app.get('/api/demo/frame', async () => frames[(demo!.snapshot().step - 1) % frames.length]);
    app.post('/api/demo/reset', async () => { demo = new DemoSession(true, energyAlertThreshold, tagoutPolicy); demo.tick(); return demo.snapshot(); });
    for (const action of ['request', 'approve', 'cancel', 'requestBack', 'dismiss'] as const) {
      app.post(`/api/demo/${action}`, async () => { demo![action](); return demo!.snapshot(); });
    }
  }
  app.post('/api/obs/disconnect', async (_request, reply) => {
    if (!obs) return reply.code(503).send({ error: 'OBS integration unavailable' });
    offthemap?.invalidateAnalysis(); qrSensor?.stop(); qr?.unavailable(); await obs.stop(); return { connected: false };
  });
  app.post('/api/obs/reconnect', async (_request, reply) => {
    if (!obs) return reply.code(503).send({ error: 'OBS integration unavailable' });
    await obs.start(); qrSensor?.start(); return { connected: obs.connected };
  });
  app.post('/api/privacy/dismiss', async (_request, reply) => {
    if (!offthemap) return reply.code(503).send({ error: 'Privacy integration unavailable' });
    try { await offthemap.dismiss(); return { dismissed: true }; }
    catch { return reply.code(503).send({ error: 'Restore unavailable; retry when OBS reconnects' }); }
  });
  app.post<{ Body: { term: string } }>('/api/terms', { schema: { body: { type: 'object', additionalProperties: false, required: ['term'], properties: { term: { type: 'string', minLength: 2, maxLength: 500 } } } } }, async (request, reply) => {
    const id = twitch?.auth.identity?.userId;
    if (!twitch || !id) return reply.code(503).send({ error: 'Twitch authorization required' });
    try {
      const result = await twitch.helix.addBlockedTerm(id, id, request.body.term) as { data: { id: string }[] };
      return { id: result.data[0]?.id };
    } catch { return reply.code(503).send({ error: 'Blocked term unavailable' }); }
  });
  app.delete<{ Params: { id: string } }>('/api/terms/:id', async (request, reply) => {
    const id = twitch?.auth.identity?.userId;
    if (!twitch || !id) return reply.code(503).send({ error: 'Twitch authorization required' });
    try { await twitch.helix.removeBlockedTerm(id, id, request.params.id); return { removed: true }; }
    catch { return reply.code(503).send({ error: 'Term removal unavailable' }); }
  });
  app.get('/api/twitch/connect', async (_request, reply) => {
    if (!twitch) return reply.code(503).send({ error: options.simulated ? 'Twitch is disabled in simulation' : 'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env' });
    return reply.redirect(twitch.auth.authorizeUrl());
  });
  app.get<{ Querystring: { code?: string; state?: string } }>('/api/twitch/callback', async (request, reply) => {
    if (!twitch) return reply.code(503).send({ error: 'Twitch is not configured' });
    try {
      await twitch.auth.exchange(request.query.code ?? '', request.query.state ?? '');
      await twitch.start();
      return reply.type('text/plain').send('Twitch authorization stored locally. Return to your Spotter dashboard.');
    } catch { return reply.code(400).send({ error: 'Twitch authorization failed. Retry Connect with Twitch.' }); }
  });
  app.post('/api/twitch/disconnect', async () => { twitch?.disconnect(); return { connected: false }; });
  app.get('/api/health', async () => ({ status: 'ok', simulated: options.simulated }));
  app.get('/api/status', async () => { if (demo) return { ...demo.snapshot(), hudEnabled }; const state = ({
    hudEnabled,
    analysis: 'analysis unavailable',
    exposure: { score: 0, active: false, dismissed: false, analysis: 'analysis unavailable' },
    crew: [], tagout: initialTagOut(), timeline: [], clues: [],
    ...(tagout?.snapshot(Date.now()) ?? {}),
    ...secondwind!.snapshot(Date.now()),
    energyAlertThreshold, tagoutEnergyThreshold: tagoutPolicy.energyThreshold, tagoutSustainS: tagoutPolicy.sustainMs / 1000,
    combinedAlert: advanceCombinedAlert(energyHold, { now: Date.now(), energy: secondwind!.snapshot(Date.now()).energy, exposure: offthemap?.snapshot().exposure.score ?? null, available: offthemap?.snapshot().analysis === 'available', threshold: energyAlertThreshold }).active,
    ...(offthemap?.snapshot() ?? {}),
    qrGuard: qr?.snapshot()??{enabled:false,status:'unavailable'},
    moderation: guard?.snapshot().entries ?? [],
    chatGuard: guard?.snapshot().status ?? 'analysis unavailable',
    connected: { twitch: twitch?.snapshot().connected ?? false, obs: obs?.connected ?? false, ai: offthemap?.snapshot().analysis === 'available' },
    twitch: twitch?.snapshot() ?? { configured: false, connected: false, status: 'not configured' },
    chat: twitch?.snapshot().chat ?? { messagesPerMinute: 0, uniqueChattersPerMinute: 0 },
  });
    if (state.combinedAlert && !combinedWasActive) presentationEvents.push({ at: Date.now(), label: 'Combined alert', kind: 'alert' });
    combinedWasActive = state.combinedAlert;
    if (presentationEvents.length > 120) presentationEvents.splice(0, presentationEvents.length - 120);
    return { ...state, qrEvents:qr?.snapshot().entries??[], presentationEvents: [...presentationEvents, ...(offthemap?.snapshot().presentationEvents ?? [])] };
  });
  return app;
}

function readLatencyBenchmark(): unknown {
  try {
    const value = JSON.parse(readFileSync('data/takes/latency/latest.json', 'utf8')) as { at: unknown; controlled: unknown; simulatedInput?: boolean; scene: { n: number; medianMs: number | null; p95Ms: number | null }; model: unknown; width: unknown; intervalMs: unknown };
    const stats = value.scene;
    if (value.controlled !== true || !Number.isInteger(stats.n) || stats.n < 1 || ![stats.medianMs, stats.p95Ms].every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0)) return null;
    return { at: value.at, controlled: true, simulatedInput: value.simulatedInput === true, scene: { n: stats.n, medianMs: stats.medianMs, p95Ms: stats.p95Ms }, model: value.model, width: value.width, intervalMs: value.intervalMs };
  } catch { return null; }
}
