import Fastify from 'fastify';
import { DatabaseSync } from 'node:sqlite';

export function createApp(options: { databasePath: string; simulated: boolean }) {
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  const database = new DatabaseSync(options.databasePath);
  database.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  app.addHook('onClose', async () => { database.close(); });
  app.get('/api/health', async () => ({ status: 'ok', simulated: options.simulated }));
  app.get('/api/status', async () => ({
    simulated: options.simulated,
    analysis: 'analysis unavailable',
    connected: { twitch: false, obs: false, ai: false },
  }));
  return app;
}
