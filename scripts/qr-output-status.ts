import { qrOutputStatus } from '../src/obs/qr-proof-state.ts';
try {
  for (const port of [4455, 4456])
    console.log(
      JSON.stringify(
        await qrOutputStatus(`ws://127.0.0.1:${port}`, process.env.OBS_WEBSOCKET_PASSWORD ?? ''),
      ),
    );
} catch {
  console.error('Output status unavailable; no stream settings or credentials read.');
  process.exitCode = 1;
}
