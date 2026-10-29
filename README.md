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

This scaffold does not yet connect to Twitch, OBS or AI, collect audio, or run the scripted demo. `npm run demo` currently starts the scaffold with simulation badges; the complete story is phase 2.

Spotter never outputs a location, never saves vision frames and keeps raw audio local. Measurements are private unless explicitly enabled on the overlay. A low findability score means “no obvious clues detected”; it is not a safety guarantee. Simulated inputs must display `SIMULATED`.

See [brief](BRIEF.md), [build plan](PLAN.md), [Codex work log](docs/codex-log.md) and [session ID](docs/CODEX_SESSION.md).
