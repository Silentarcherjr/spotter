# AGENTS.md — rules for Codex in this repo

Read `BRIEF.md` first. It defines the product, the ethics rules and the definition of done.

## Stack (do not change without asking)

- Node 22+, TypeScript `strict`, ESM.
- Server: Fastify, bound to `127.0.0.1`. Storage: `node:sqlite` (local file).
- Frontend: plain TypeScript + Vite for `dashboard/` (streamer, private) and `overlay/` (OBS browser source, transparent, 1920x1080 and 1280x720).
- Audio: Web Audio API + `pitchy` (+ `meyda` only if needed) in `sensor/` (browser page).
- Twitch: EventSub over WebSocket and Helix with plain `fetch`. No Twitch SDKs.
- OBS: `obs-websocket-js` (obs-websocket v5).
- AI: OpenAI Responses API with Structured Outputs. Model name in config, never hard-coded.
- Tests: `node:test` + `node:assert`. Fixtures in `test/fixtures/`.

## Layout

```
src/
  twitch/      # all Twitch calls live here (auth, eventsub, helix)
  obs/         # all OBS calls live here
  ai/          # all model calls live here (vision clues, chat classifier)
  core/        # PURE logic: scores, thresholds, state machines (no I/O)
  modules/
    offthemap/
    secondwind/
    tagout/
  sim/         # simulation sources, all behind SIM=1
  server.ts
sensor/  dashboard/  overlay/
test/
docs/codex-log.md
```

## Hard rules

1. **Observations from the model, decisions from tested code.** Model calls return typed observations only. Every action (scene switch, blur, delete, raid, alert) is decided in `src/core/` by pure functions with unit tests.
2. **Never produce or store a location.** The vision prompt must ask only for identifying clues. The structured-output schema must not contain any location/place/address/coordinates field. Clue descriptions are generic categories, never the literal text seen. Add a test that fails if the schema gains such a field.
3. **No Twitch, OBS or AI calls outside** `src/twitch/`, `src/obs/`, `src/ai/`.
4. **Audio stays local.** Only numeric features leave the sensor page. Never record or upload raw audio. Frames sent to the vision model are not written to disk.
5. **Simulation is explicit.** Anything from `src/sim/` sets `simulated: true` on its events, and the overlay/dashboard must render a `SIMULATED` badge for them. Add a test for this.
6. **Every action is reversible or approved.** Raids require a click. Auto-blur can be dismissed. Deleted messages are logged for mods.
7. **No secrets in the repo.** Use `.env` (gitignored) and `.env.example`.
8. **Tests first for `src/core/`.** Write or update tests before changing scoring, thresholds or state machines. `npm test` must pass before you say a task is done.
9. **Fail soft.** If the vision/LLM call fails or times out, keep the last score, show "analysis unavailable", and never take an automatic action on missing data.

## Twitch notes

- Scopes: `user:read:chat`, `user:write:chat`, `moderator:manage:blocked_terms`, `moderator:manage:chat_messages`, `channel:manage:raids`, `channel:manage:broadcast`.
- EventSub WebSocket: subscribe within 10 s of `session_welcome`; handle `session_reconnect` and keepalive timeouts; dedupe by message id.
- Subscriptions: `channel.chat.message` (condition: `broadcaster_user_id`, `user_id`), `channel.raid` (`to_broadcaster_user_id` and `from_broadcaster_user_id`), `stream.online`, `stream.offline`.
- Start a Raid: only the broadcaster's own token; both channels live; 10 requests per 10 min; Twitch runs a 90 s countdown; confirm via `channel.raid`; cancel with DELETE.
- Use the Twitch CLI (`twitch event trigger ...`, `twitch mock-api`) for fixtures and offline tests.
- Check the official docs at dev.twitch.tv before using any endpoint you have not used yet in this repo.

## OBS notes

- `GetSourceScreenshot` (sourceName = program scene or camera source, imageFormat `jpg`, imageWidth from `VISION_FRAME_WIDTH` (default 1280)) every 3–5 s.
- Actions: `SetCurrentProgramScene` to the configured "Privacy" scene, or `SetSourceFilterEnabled` on a configured blur filter.
- Reconnect automatically; never crash the server if OBS is closed.

## Commands (keep these working)

- `npm run dev`: server + dashboard + overlay + sensor.
- `npm test`: all tests.
- `npm run demo`: full scripted demo with `SIM=1` and mock AI (no keys needed).
- `npm run lint` and `npm run typecheck`.

## Working style

- Small steps. After each task: run tests, summarise what changed, append a dated entry to `docs/codex-log.md` (prompt summary, files touched, tests added, bugs found).
- When something fails live, turn it into a regression test before fixing it.
- Ask before adding a dependency.
