import { readMarkerProof } from '../src/twitch/proof.ts';
try {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET)
    throw new Error('Twitch unavailable');
  const markers = await readMarkerProof(
    {
      clientId: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
      redirectUri: process.env.TWITCH_REDIRECT_URI ?? 'http://localhost:3210/api/twitch/callback',
    },
    process.env.DATABASE_PATH ?? 'data/spotter.sqlite',
  );
  console.log(JSON.stringify({ markers }));
} catch (error) {
  const detail =
    error instanceof Error && /^Twitch request unavailable \(\d{3}\)$/.test(error.message)
      ? `: ${error.message}`
      : '';
  console.error(`Marker readback unavailable${detail}; no credentials displayed.`);
  process.exitCode = 1;
}
