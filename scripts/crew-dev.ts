import { spawn } from 'node:child_process';
import { prepareLocalCrew, crewEnvironment } from './crew-local-config.ts';
process.umask(0o077);
try {
  const role = process.argv[2] ?? 'secondary';
  if (role !== 'primary' && role !== 'secondary') throw new Error('Use primary or secondary');
  const { root, secret } = await prepareLocalCrew();
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) throw new Error('Configure Twitch credentials locally first');
  const child = spawn(process.execPath, ['scripts/dev.mjs'], { env: crewEnvironment(role, process.env, root, secret), stdio: 'inherit' });
  console.log(`Spotter ${role}: http://127.0.0.1:${role === 'primary' ? 5173 : 5174}/dashboard/`);
  let closing = false;
  const close = () => { if (!closing) { closing = true; child.kill('SIGTERM'); } };
  process.once('SIGINT', close); process.once('SIGTERM', close);
  child.once('error', () => { console.error('Local crew process unavailable'); process.exitCode = 1; });
  child.once('exit', (code) => { process.exitCode = code ?? 0; });
} catch (error) { console.error(error instanceof Error ? error.message : 'Crew setup unavailable'); process.exitCode = 1; }
