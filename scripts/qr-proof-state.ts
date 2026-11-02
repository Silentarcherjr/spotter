import { readQrProofState } from '../src/obs/qr-proof-state.ts';
try {
  for (let i = 0; i < 12; i++) {
    console.log(
      JSON.stringify(
        await readQrProofState(
          process.env.OBS_WEBSOCKET_URL ?? 'ws://127.0.0.1:4455',
          process.env.OBS_WEBSOCKET_PASSWORD ?? '',
          process.env.QR_GUARD_SOURCE ?? process.env.OBS_SOURCE ?? 'Spotter IRL',
        ),
      ),
    );
    await new Promise((r) => setTimeout(r, 500));
  }
} catch {
  console.error('Proof diagnostic unavailable; no credentials displayed.');
  process.exitCode = 1;
}
