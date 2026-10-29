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

## Second Wind (microphone proof pending)

Open the sensor page and click **Enable local microphone**. Web Audio requests echo cancellation, noise suppression and automatic gain control off. `pitchy` applies a clarity gate to F0; RMS, pitch median/range, spectral slope, voiced ratio, pause length and a rough envelope-peak speech-rate proxy are calculated in-browser. The WebSocket accepts only the eight numeric fields at approximately one-second intervals; extra keys, binary packets and stale/invalid values close the connection. Stopping, closing the page or losing the server stops the microphone tracks.

Calibration needs ten minutes and at least 300 usable windows. A numeric-only baseline profile is stored locally and can be recalibrated. Keep the sensor page active: browsers may throttle background tabs, and too few frames produce no measurement. Sensor data older than five seconds is shown as unavailable. Energy is a personal heuristic, not a health or fatigue assessment.

The rally meter uses chat messages and never changes measured energy. Enable the public HUD explicitly to show stamina/rally. The [session report](http://127.0.0.1:5173/dashboard/report.html) shows this session's energy/chat curves, peak/low and correlation. Live aggregate points are saved every 30 seconds; raw audio is never recorded or sent. The report currently covers the running server session.

## Tag Out (two-channel proof pending)

For the local hackathon crew, run one Spotter instance per broadcaster with separate API/Vite ports and SQLite files. Each authorizes its own Twitch account. Twitch tokens stay in that instance's local database; they are never sent to another instance.

Copy `docs/crew.example.json` to `data/crew.json`, replace the partner's numeric Twitch user ID, local status endpoint and shared secret, then set `CREW_FILE=data/crew.json`. Set each instance's own `CREW_SHARED_SECRET` to a different private value and place that value in the other instance's crew config. The authenticated peer endpoint returns only energy/live status. Loopback endpoints only; this is not a hosted crew service. Configure the partner instance's own API/Vite ports, database path and OAuth redirect URI, and register that redirect in the Twitch app too.

After two minutes of low available energy, core logic suggests a live high-energy crew member. A click rechecks both streams through Helix, verifies the source token owner and the persisted attempt window, then requests the raid. The UI waits for Twitch's raid event; the 90-second timer is informational. A timeout cannot claim success or retry automatically: check Twitch or cancel. Raid state and attempt history survive server restarts. The receiving partner can request tag back and must approve it using their own dashboard/token. With HUD opt-in, the receiving overlay shows the covering message.

Human proof still required: two live authorized test channels, real raid and tag back, target raid settings and a recording. No real raid has been performed by these tests.
