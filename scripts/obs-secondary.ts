import { resolve } from 'node:path';
import { launchSecondaryObs, isolateSecondaryObs } from '../src/obs/secondary.ts';
import { setupObs } from '../src/obs/setup.ts';
try {
  if (process.argv.includes('--launch')) {
    const pid = launchSecondaryObs();
    console.log(
      JSON.stringify({ secondaryObsPid: pid, websocketPort: 4456, outputsStarted: false }),
    );
  } else {
    const password = process.env.OBS_WEBSOCKET_PASSWORD ?? '';
    console.log(JSON.stringify(await isolateSecondaryObs('ws://127.0.0.1:4456', password)));
    const result = await setupObs({
      url: 'ws://127.0.0.1:4456',
      password,
      videoPath: resolve(process.env.VISION_VIDEO_PATH ?? 'data/clips/pexels-street.mp4'),
      webOrigin: 'http://127.0.0.1:5174',
    });
    console.log(
      JSON.stringify({
        scenes: result.scenes,
        sources: result.sources,
        overlayPort: 5174,
        outputsStarted: false,
      }),
    );
  }
} catch {
  console.error('Secondary OBS unavailable; no stream settings or credentials read/displayed.');
  process.exitCode = 1;
}
