import { runHudBridge, disableHudBridge } from '../src/obs/hud-bridge.ts';
try {
  if (process.argv.includes('--stop')) {
    await disableHudBridge(process.env.OBS_WEBSOCKET_PASSWORD ?? '');
    console.log('Temporary HUD bridge sources disabled; OBS outputs unchanged.');
  } else await runHudBridge(process.env.OBS_WEBSOCKET_PASSWORD ?? '');
} catch {
  console.error('Public HUD bridge unavailable; no credentials displayed.');
  process.exitCode = 1;
}
