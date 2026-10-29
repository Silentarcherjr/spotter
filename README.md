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
