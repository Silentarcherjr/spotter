# Build plan: phases, not days

Deadline: **Monday Nov 2, 2026, 2:00pm PST (5:00pm Panama)**. Target: submit by **1:00pm Panama**.

Work through the phases in order, without waiting between them. After each phase: run `npm test`, commit and push, append an entry to `docs/codex-log.md`, then continue with the next phase. Only stop and ask the human when you hit a **[HUMAN]** step (credentials, OBS, live channels, media) or a real blocker. If a [HUMAN] step is pending, build everything that can run in `SIM=1` / mock mode and come back to it.

## Human setup checklist (do in parallel, any time)

- [ ] **[HUMAN]** Twitch dev app at dev.twitch.tv/console; client ID in `.env`. Two test channels (main + crew partner). Twitch CLI installed.
- [ ] **[HUMAN]** OBS: WebSocket server on; scenes `Main` and `Privacy`; a blur filter on the camera/media source; password in `.env`.
- [ ] **[HUMAN]** OpenAI API key in `.env`.
- [ ] **[HUMAN]** Demo media you have rights to: IRL street walk clip (no identifiable bystanders), voice clip that gradually gets flatter/quieter.
- [ ] **[HUMAN]** Codex session ID from `/status` saved in `docs/CODEX_SESSION.md`.

## Phase 0: repo and scaffold

- Create the GitHub repo, initialise git, first commit with BRIEF/AGENTS/PLAN.
- Scaffold the layout from AGENTS.md: package.json, strict tsconfig, ESM, .gitignore (with .env), .env.example, scripts `dev`, `test`, `demo`, `lint`, `typecheck`.
- `npm run dev` serves empty dashboard, overlay and sensor pages.
- `docs/codex-log.md`, `docs/CODEX_SESSION.md`.

## Phase 1: pure core (tests first)

In `src/core/`, tests before code:
- Findability score from clues over time (decay, combinations add up, thresholds warn/act).
- Energy score vs personal baseline (calibration window, smoothing, z-scores).
- Chat velocity and energy-vs-chat correlation.
- Combined alert (low energy + high exposure).
- Tag Out state machine (idle → suggested → confirming → raiding → covered → tag-back → home; cancel paths; rate-limit guard).
- Schema test: vision output schema has no location/place/address/coordinates field.
- Simulation test: events from `src/sim/` carry `simulated: true`.

## Phase 2: simulation + mock AI (everything runs with no keys)

- `src/sim/`: frame source from a video file or image folder, synthetic chat injector, voice-feature generator with decay, simulated crew partner.
- Mock vision and mock chat classifier with deterministic fixtures.
- `npm run demo` plays the full scripted story end to end with `SIMULATED` badges.

## Phase 3: Twitch integration

- OAuth (device code or localhost auth code), token storage, refresh.
- EventSub WebSocket: welcome/subscribe, keepalive, reconnect, dedupe. `channel.chat.message`, `channel.raid`, `stream.online/offline`.
- Helix: send chat message, create stream marker, add/remove blocked terms, delete chat message, start/cancel raid.
- Fixtures from the Twitch CLI; tests for handlers.
- **[HUMAN]** verify on the real test channel: live chat rate appears in the dashboard.

## Phase 4: Off the Map (hero)

- OBS client: connect/reconnect, `GetSourceScreenshot` loop every 3–5 s, `SetCurrentProgramScene`, `SetSourceFilterEnabled`.
- Vision call (Responses API, structured output, clue categories only), fail-soft.
- Dashboard: findability meter, clue list, alert banner, dismiss button, exposure replay timeline.
- Actions decided in core: warn, privacy scene / blur, stream marker.
- Chat Guard: private sensitive terms → Helix Blocked Terms; classifier for paraphrased guesses → private mod notice + log by default; automatic deletion is opt-in.
- **[HUMAN]** recorded real take: meter climbs, scene blurs, a guessing message is removed on the test channel.

## Phase 5: Second Wind

- Sensor page: mic capture with processing off, features per 1 s window (loudness, F0 median/range via pitchy, spectral slope, voiced ratio, pauses, rough speech rate), only numbers sent over WebSocket.
- Calibration UI and saved baseline profile.
- Dashboard: energy curve vs chat curve, correlation callout.
- Overlay (opt-in): stamina bar; rally meter fed by chat; celebration when full.
- Combined alert with Off the Map.
- End-of-stream report page.

## Phase 6: Tag Out

- Crew config (partners and their tokens, local only for the hackathon).
- Suggestion: partner live with the highest energy; one-click Start Raid; countdown UI; confirm via `channel.raid`; cancel.
- Partner overlay: "Covering for <name>'s community".
- Tag back from the partner side with one-click approval.
- **[HUMAN]** one real raid between the two test channels, recorded.

## Phase 7: polish and proof

- Dashboard readable at a glance; overlay crisp at 720p and 1080p.
- README: setup, architecture diagram, ethics rules, limitations, how Codex was used (link to the log and session ID).
- Lint, typecheck and tests all green; test count in the README.

## Phase 8: video and submission [HUMAN]

- Record takes, edit to ≤ 3:00, upload to YouTube (public or unlisted), no copyrighted music.
- Repo public, or private and shared with the address in the rules.
- Devpost: description, how Codex was used, session ID, video, repo. Submit by 1:00pm Panama on Nov 2.

## Video script (≤ 3:00)

| Time | Scene |
|---|---|
| 0:00–0:15 | Cold open: "Most Twitch tools watch the chat. Spotter watches the streamer." |
| 0:15–1:20 | **Off the Map**: IRL walk, meter 12 → 87, clues listed, auto-blur, planted chat guess vanishes, replay. "It never tells anyone where you are." |
| 1:20–2:00 | **Second Wind**: energy bar drains as the voice flattens; "energy −30%, chat −40%"; rally; combined alert "tired and exposed". |
| 2:00–2:25 | **Tag Out**: suggestion → click → raid to the high-energy partner → "covering for" overlay → tag back. |
| 2:25–2:50 | **Built with Codex**: AGENTS.md rules, test count, codex-log, a live bug turned into a test. |
| 2:50–3:00 | Close: name, repo, "Works on any channel." |

Show real Twitch (chat, blocked term, deletion, marker, raid). Any simulated input carries the `SIMULATED` badge.

## Cut order if time runs short

1. Exposure replay → 2. End-of-stream report → 3. Rally meter → 4. Tag back → 5. Tag Out (show as "next").
Never cut: Off the Map end to end, the energy bar, tests, the Codex log.
