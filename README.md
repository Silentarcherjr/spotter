# Spotter

Private local companion for Twitch streamers. The model interprets; tested code decides.

Requires Node.js 22.18+ (native TypeScript stripping and `node:sqlite`).

```sh
npm ci
cp .env.example .env
npm run dev
```

Open [dashboard](http://127.0.0.1:5173/dashboard/), [transparent OBS overlay](http://127.0.0.1:5173/overlay/) or [sensor](http://127.0.0.1:5173/sensor/). API binds exclusively to `127.0.0.1:3210`. Frontend updates reload automatically; restart `npm run dev` after server edits.

`npm test` runs Node tests, including local startup/shutdown checks. `npm run typecheck`, `npm run lint` (whitespace, eval and core purity checks) and `npm run build` validate sources. SQLite data and `.env` files are gitignored.

`npm run demo` runs the accelerated, key-free mock story: findability rises, a reversible privacy blur activates, energy and chat activity fall, a simulated guessing message is logged as removed, then Tag Out suggests a partner. Approve the simulated raid, request tag back and approve again as the simulated partner. Replay restarts the story. Public stamina requires the dashboard opt-in. All simulated sources and views display `SIMULATED`.

The default image is an illustrative SVG fixture; mock clues follow the deterministic script rather than interpreting pixels. Set `SIM_FRAME_DIR` to a folder with 1–20 owned JPEG, PNG or SVG frames (max 2 MB each, 20 MB total) to replace it. Existing media is read into memory; no screenshots are saved. Real IRL/voice demo media is still pending.

Twitch, OBS, real AI calls and the microphone sensor are not connected yet. No real raid or deletion occurs in demo mode. The sensor page explicitly says that it does not open the microphone.

Spotter never outputs a location, never saves vision frames and keeps raw audio local. Measurements are private unless explicitly enabled on the overlay. A low findability score means “no obvious clues detected”; it is not a safety guarantee. Simulated inputs must display `SIMULATED`.

See [brief](BRIEF.md), [build plan](PLAN.md), [Codex work log](docs/codex-log.md) and [session ID](docs/CODEX_SESSION.md).

## Twitch (live verification pending)

Register a Twitch application with the exact redirect URI `http://localhost:3210/api/twitch/callback`. Set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` and optionally `TWITCH_REDIRECT_URI` in `.env`. Start `npm run dev` and click **Connect with Twitch**. The server stores tokens in the ignored local SQLite database, validates them on startup/hourly and refreshes them server-side. Server-created data uses owner-only file permissions. Keep `.env` private as well.

The dashboard can receive live chat activity via native WebSocket EventSub. Helix adapters for chat, markers, blocked terms, single-message deletion and raid start/cancel are implemented, but no UI invokes these live actions yet. `SIM=1` disables Twitch entirely.

Offline Twitch tests use hand-written shapes based on the official documentation, not Twitch CLI captures. The CLI is not installed here. The human verification checklist still requires installing it, collecting `twitch event trigger` / `twitch mock-api` fixtures, and proving chat on a live test channel. Never put real tokens or sensitive chat text in fixtures.

Implementation references: [OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/), [EventSub WebSocket](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [subscriptions](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), [Helix](https://dev.twitch.tv/docs/api/reference/).

## Off the Map (live proof pending)

Set `OPENAI_API_KEY` and `OPENAI_MODEL` to a model that supports image input and strict Structured Outputs. Set `OBS_WEBSOCKET_PASSWORD`, `OBS_WEBSOCKET_URL` and `OBS_PRIVACY_SCENE`. Optionally set both `OBS_SOURCE` and `OBS_BLUR_FILTER` to use a filter instead of the privacy scene. With these configured, `npm run dev` samples at four-second intervals. Missing OBS/AI data retains the last score and cannot trigger an action. The dashboard's dismiss button restores the previous scene/filter state; retry if OBS is unavailable.

The Responses request uses `store: false`, an in-memory JPEG and a closed generic clue schema. The client rejects refusals, incomplete responses, extra fields and non-generic descriptions. Spotter writes no captured frames to disk. OpenAI's service-side data handling still follows your API account's data controls; `store: false` is not a claim of zero provider retention.

Chat Guard classifies messages only when Twitch and AI are configured. Pure code authorizes high-confidence guessing-message deletion. The private dashboard audit keeps message IDs, timestamps and outcomes; it does not keep message text. Sensitive terms entered in the private form go directly to Twitch blocked terms and are not stored by Spotter. Keep their returned IDs for removal.

References: [Responses structured output](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [image input](https://developers.openai.com/api/docs/guides/images-vision), [OBS client](https://github.com/obs-websocket-community-projects/obs-websocket-js).
