import OBSWebSocket from 'obs-websocket-js';
import type { OBSRequestTypes, OBSResponseTypes } from 'obs-websocket-js';
import { spawn } from 'node:child_process';
import type { SetupWire } from './setup.ts';
const secondaryName = 'Spotter - alredio';

/** Official OBS CLI; no output starts automatically and no credential is placed in argv. */
export function launchSecondaryObs(): number | undefined {
  const child = spawn('/Applications/OBS.app/Contents/MacOS/OBS', ['--multi', '--profile', secondaryName, '--collection', secondaryName, '--websocket_port', '4456', '--websocket_ipv4_only'], { detached: true, stdio: 'ignore' });
  child.unref(); return child.pid;
}
export async function isolateSecondaryObs(url: string, password: string, wire: SetupWire = new OBSWebSocket(), timeoutMs = 8000) {
  const bounded = async <T>(promise: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Secondary OBS request timed out')), timeoutMs); })]); }
    finally { clearTimeout(timer); }
  };
  const call = <T extends keyof OBSRequestTypes>(request: T, data?: OBSRequestTypes[T]): Promise<OBSResponseTypes[T]> => bounded(wire.call(request, data));
  if (new URL(url).port !== '4456') throw new Error('Secondary OBS must use port4456');
  try {
    await bounded(wire.connect(url, password));
    const stream = await call('GetStreamStatus'); const record = await call('GetRecordStatus');
    if (stream.outputActive || record.outputActive) throw new Error('Stop secondary outputs manually before changing profiles');
    const profiles = await call('GetProfileList');
    if (!profiles.profiles.includes(secondaryName)) await call('CreateProfile', { profileName: secondaryName });
    else if (profiles.currentProfileName !== secondaryName) await call('SetCurrentProfile', { profileName: secondaryName });
    const collections = await call('GetSceneCollectionList');
    if (!collections.sceneCollections.includes(secondaryName)) await call('CreateSceneCollection', { sceneCollectionName: secondaryName });
    else if (collections.currentSceneCollectionName !== secondaryName) await call('SetCurrentSceneCollection', { sceneCollectionName: secondaryName });
    const verifiedProfile = await call('GetProfileList'); const verifiedCollection = await call('GetSceneCollectionList');
    if (verifiedProfile.currentProfileName !== secondaryName || verifiedCollection.currentSceneCollectionName !== secondaryName) throw new Error('Secondary OBS isolation failed');
    return { profile: secondaryName, collection: secondaryName, streaming: false, recording: false };
  } finally { await bounded(wire.disconnect()).catch(() => {}); }
}
