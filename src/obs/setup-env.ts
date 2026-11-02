import { obsSetupNames } from './setup.ts';

/** Copy unrelated lines opaquely: credentials are never parsed, returned separately or logged. */
export function updateObsEnv(source: string): string {
  const values: Record<string, string> = {
    OBS_MAIN_SCENE: obsSetupNames.main,
    OBS_PRIVACY_SCENE: obsSetupNames.scene,
    OBS_SOURCE: obsSetupNames.media,
    OBS_OVERLAY_SOURCE: obsSetupNames.overlay,
    OBS_PRIVACY_SOURCE: obsSetupNames.privacy,
    OBS_BLUR_FILTER: '',
  };
  const pending = new Set(Object.keys(values));
  const lines: string[] = [];
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const key = /^\s*(?:export\s+)?([A-Z_]+)\s*=/.exec(line)?.[1];
    if (key && Object.hasOwn(values, key)) {
      if (pending.delete(key)) lines.push(`${key}=${JSON.stringify(values[key])}`);
    } else lines.push(line);
  }
  while (lines.at(-1) === '') lines.pop();
  for (const key of pending) lines.push(`${key}=${JSON.stringify(values[key])}`);
  return lines.join('\n') + '\n';
}
