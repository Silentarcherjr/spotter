import { readObsProof, cueObsClip, watchObsScenes, showObsMain, restartObsClip } from '../src/obs/proof.ts';
try {
  if (process.argv.includes('--main')) await showObsMain(process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455', process.env.OBS_WEBSOCKET_PASSWORD ?? '');
  if (process.argv.includes('--restart')) await restartObsClip(process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455', process.env.OBS_WEBSOCKET_PASSWORD ?? '');
  if (process.argv.includes('--watch-scenes')) { console.log(JSON.stringify({ scenes: await watchObsScenes(process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455', process.env.OBS_WEBSOCKET_PASSWORD ?? '') })); process.exit(0); }
  if (process.argv.includes('--cue-demo') || process.argv.includes('--cue-building') || process.argv.includes('--resume')) await cueObsClip(process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455', process.env.OBS_WEBSOCKET_PASSWORD ?? '', process.argv.includes('--resume'), process.argv.includes('--cue-building') ? 4000 : 10000);
  console.log(JSON.stringify(await readObsProof(process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455', process.env.OBS_WEBSOCKET_PASSWORD ?? '', process.argv.includes('--capture-metadata')))); }
catch { console.error('OBS proof unavailable; no credentials displayed.'); process.exitCode = 1; }
