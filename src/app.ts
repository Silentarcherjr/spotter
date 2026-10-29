import Fastify from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { DemoSession } from './sim/session.ts';
import { loadFrameFolder } from './sim/frames.ts';
import { fileURLToPath } from 'node:url';

export function createApp(options: { databasePath: string; simulated: boolean; frameDirectory?: string }) {
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  const database = new DatabaseSync(options.databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  let demo = options.simulated ? new DemoSession(true) : null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let hudEnabled = false;
  let frames: Awaited<ReturnType<typeof loadFrameFolder>> = [];
  app.addHook('onReady', async () => {
    if (demo) { frames = await loadFrameFolder(true, options.frameDirectory ?? fileURLToPath(new URL('../test/fixtures/frames', import.meta.url))); demo.tick(); timer = setInterval(() => demo?.tick(), 4_000); timer.unref(); }
  });
  app.addHook('onClose', async () => { clearInterval(timer); database.close(); });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (request.method === 'POST' && request.headers.origin) {
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
  app.get('/api/health', async () => ({ status: 'ok', simulated: options.simulated }));
  app.get('/api/status', async () => demo ? demo.snapshot() : ({
    simulated: options.simulated,
    analysis: 'analysis unavailable',
    connected: { twitch: false, obs: false, ai: false },
  }));
  return app;
}
