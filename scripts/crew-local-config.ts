import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, chmod, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
export type CrewRole = 'primary' | 'secondary';

export async function prepareLocalCrew(
  directory = 'data/crew',
): Promise<{ root: string; secret: string }> {
  const root = resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const path = join(root, 'shared-secret');
  try {
    await writeFile(path, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  await chmod(path, 0o600);
  const secret = (await readFile(path, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Invalid local crew secret file');
  for (const role of ['primary', 'secondary']) {
    const peerFile = join(root, `${role}-crew.json`);
    try {
      await access(peerFile);
    } catch {
      await writeFile(peerFile, '[]\n', { flag: 'wx', mode: 0o600 });
    }
    await chmod(peerFile, 0o600);
  }
  return { root, secret };
}
export function crewEnvironment(
  role: CrewRole,
  base: NodeJS.ProcessEnv,
  root: string,
  secret: string,
): NodeJS.ProcessEnv {
  return {
    ...base,
    SIM: '0',
    CREW_SHARED_SECRET: secret,
    CREW_FILE: join(root, `${role}-crew.json`),
    ...(role === 'secondary'
      ? {
          PORT: '3220',
          VITE_PORT: '5174',
          DATABASE_PATH: join(root, 'secondary.sqlite'),
          TWITCH_REDIRECT_URI: 'http://localhost:3220/api/twitch/callback',
          // Empty overrides prevent the child --env-file from reloading these integrations.
          OBS_WEBSOCKET_PASSWORD: '',
          OPENAI_API_KEY: '',
          OPENAI_MODEL: '',
        }
      : {
          PORT: '3210',
          VITE_PORT: '5173',
          DATABASE_PATH: base.DATABASE_PATH ?? 'data/spotter.sqlite',
        }),
  };
}
export async function linkLocalCrew(
  directory: string,
  primaryId: string,
  secondaryId: string,
): Promise<void> {
  if (!/^\d+$/.test(primaryId) || !/^\d+$/.test(secondaryId) || primaryId === secondaryId)
    throw new Error('Authorize two different Twitch accounts before linking');
  const { root, secret } = await prepareLocalCrew(directory);
  for (const [role, id, port] of [
    ['primary', secondaryId, 3220],
    ['secondary', primaryId, 3210],
  ] as const) {
    await writeFile(
      join(root, `${role}-crew.json`),
      JSON.stringify(
        [{ id, endpoint: `http://127.0.0.1:${port}/api/crew/status`, token: secret }],
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
  }
}
