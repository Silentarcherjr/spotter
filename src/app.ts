import Fastify from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { DemoSession } from './sim/session.ts';
import { loadFrameFolder } from './sim/frames.ts';
import { fileURLToPath } from 'node:url';
import { TwitchRuntime } from './twitch/runtime.ts';
import type { TwitchConfig } from './twitch/auth.ts';
import { ObsClient } from './obs/client.ts';
import type { ObsConfig } from './obs/client.ts';
import { ResponsesAI } from './ai/responses.ts';
import type { AIConfig } from './ai/responses.ts';
import { OffTheMap } from './modules/offthemap/runtime.ts';
import { ChatGuard } from './modules/offthemap/chat-guard.ts';
import { initialTagOut } from './core/tagout.ts';

export function createApp(options: { databasePath: string; simulated: boolean; frameDirectory?: string; twitch?: TwitchConfig; obs?: ObsConfig; ai?: AIConfig }) {
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  const database = new DatabaseSync(options.databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  let demo = options.simulated ? new DemoSession(true) : null;
  const twitch = !options.simulated && options.twitch ? new TwitchRuntime(database, options.twitch) : null;
  const obs = !options.simulated && options.obs ? new ObsClient(options.obs) : null;
  const ai = !options.simulated && options.ai ? new ResponsesAI(options.ai) : null;
  const offthemap = obs && ai ? new OffTheMap({ capture: () => obs.capture(), analyze: (frame) => ai.vision(frame), privacy: () => obs.applyPrivacy(), restore: () => obs.restore(), marker: async () => {
    const id = twitch?.auth.identity?.userId;
    if (twitch && id) return twitch.helix.marker(id);
    throw new Error('Twitch unavailable');
  } }) : null;
  const guard = ai && twitch ? new ChatGuard(database, { classify: (message) => ai.classifyChat(message), remove: async (id) => {
    const user = twitch.auth.identity?.userId;
    if (!user) throw new Error('Twitch authorization required');
    return twitch.helix.deleteMessage(user, user, id);
  }, notify: async (_id) => { /* Audit is the private mod notice, exposed on the dashboard. */ } }) : null;
  if (guard) twitch?.setChatHandler((id, message, at) => guard.check(id, message, at));
  let visionTimer: ReturnType<typeof setInterval> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let hudEnabled = false;
  let frames: Awaited<ReturnType<typeof loadFrameFolder>> = [];
  app.addHook('onReady', async () => {
    await twitch?.start();
    if (obs) void obs.start();
    if (offthemap) { visionTimer = setInterval(() => { void offthemap.sample(Date.now()); }, 4_000); visionTimer.unref(); }
    if (demo) { frames = await loadFrameFolder(true, options.frameDirectory ?? fileURLToPath(new URL('../test/fixtures/frames', import.meta.url))); demo.tick(); timer = setInterval(() => demo?.tick(), 4_000); timer.unref(); }
  });
  app.addHook('onClose', async () => { clearInterval(timer); clearInterval(visionTimer); twitch?.stop(); await obs?.stop(); database.close(); });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.origin) {
      const allowed = [`http://127.0.0.1:${process.env.VITE_PORT ?? 5173}`, `http://127.0.0.1:${process.env.PORT ?? 3210}`];
      if (!allowed.includes(request.headers.origin)) return reply.code(403).send({ error: 'Invalid origin' });
    }
  });
  app.get('/api/overlay', async () => hudEnabled && demo ? { simulated: true, enabled: true, energy: demo.snapshot().energy, phase: demo.snapshot().tagout.phase } : { simulated: options.simulated, enabled: false });
  app.post<{ Body: { enabled: boolean } }>('/api/hud', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['enabled'], properties: { enabled: { type: 'boolean' } } } },
  }, async (request) => { hudEnabled = request.body.enabled; return { enabled: hudEnabled }; });
  if (demo) {
    app.get('/api/demo/frame', async () => frames[(demo!.snapshot().step - 1) % frames.length]);
    app.post('/api/demo/reset', async () => { demo = new DemoSession(true); demo.tick(); return demo.snapshot(); });
    for (const action of ['approve', 'cancel', 'requestBack', 'dismiss'] as const) {
      app.post(`/api/demo/${action}`, async () => { demo![action](); return demo!.snapshot(); });
    }
  }
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
  app.get('/api/status', async () => demo ? demo.snapshot() : ({
    simulated: options.simulated,
    analysis: 'analysis unavailable',
    exposure: { score: 0, active: false, dismissed: false, analysis: 'analysis unavailable' },
    energy: null, calibration: 0, combinedAlert: false, crew: [], tagout: initialTagOut(), curves: [], timeline: [], clues: [],
    ...(offthemap?.snapshot() ?? {}),
    moderation: guard?.snapshot().entries ?? [],
    chatGuard: guard?.snapshot().status ?? 'analysis unavailable',
    connected: { twitch: twitch?.snapshot().connected ?? false, obs: obs?.connected ?? false, ai: offthemap?.snapshot().analysis === 'available' },
    twitch: twitch?.snapshot() ?? { configured: false, connected: false, status: 'not configured' },
    chat: twitch?.snapshot().chat ?? { messagesPerMinute: 0, uniqueChattersPerMinute: 0 },
  }));
  return app;
}
