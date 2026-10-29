# Codex work log

## 2026-10-29 — Repository initialization and phase 0 preparation

- Request: create private `spotter`, initialize this folder, push BRIEF.md, AGENTS.md and PLAN.md, then continue Day 1.
- Read BRIEF.md first, then AGENTS.md and PLAN.md. The current plan uses phases; begin with phase 0.
- Created https://github.com/Silentarcherjr/spotter as PRIVATE, connected origin, and pushed initial commit `e7e5369` with exactly the three requested documents.
- Added `.gitignore`, `.env.example`, this log and `docs/CODEX_SESSION.md` while dependency approval is pending.
- Verification: GitHub reports PRIVATE; default branch is main; local main tracks origin/main. No executable code exists yet, so npm tests are not available yet.
- Environment issue: sandbox network restrictions initially made gh authentication appear invalid; the same authentication succeeded with approved network access.
- Pending: approval required by AGENTS.md before adding Fastify, TypeScript, Vite and @types/node; scaffold and executable checks follow approval.

## 2026-10-29 — Phase 0 scaffold

- User approved Fastify, TypeScript, Vite and @types/node. Installed with package lock; npm audit reported no vulnerabilities.
- Added ESM package/scripts, strict TypeScript, local Fastify API with node:sqlite settings storage, Vite pages for dashboard/overlay/sensor, shared shell/styles, environment example, gitignore and setup README.
- Established the required source/module directories; implementation files will populate them in subsequent phases.
- Tests added: API health/status with real vs simulated flags; process-level dev startup, all three pages, API proxy and process shutdown.
- Live bug: Node --watch hit EMFILE here. Added a failing regression first, removed the server watcher and configured Vite polling; README documents manual server restart. Sandbox also blocks listening on localhost, so startup verification requires network-enabled execution.
- SIM mode currently labels the scaffold only; full scripted demo is phase 2. No credentials or external service calls used.

## 2026-10-29 — Phase 1 pure decision core (tests first)

- Added failing tests before implementation for findability decay/combination/deduplication, inclusive warning/action thresholds, dismiss/rearm, unavailable analysis, ten-minute personal audio calibration, z-score smoothing, chat velocity/correlation, combined alert and Tag Out approval/cancel/confirmation/rate limits.
- Implemented pure modules in src/core/{types,exposure,energy,chat,tagout}.ts with explicit timestamps and no I/O. Thresholds and scores are initial deterministic heuristics, not validated safety or health measurements.
- Added the vision contract in src/ai/vision-contract.ts. Descriptions are an allowlist of generic phrases; runtime parsing drops descriptions entirely and rejects extra fields, literal text, invalid severity/confidence or category/description mismatch. Recursive schema regression forbids location/text keys and open objects.
- Added a gated simulation event factory in src/sim/events.ts; simulated:false cannot override the mandatory true flag.
- Verification: 14 tests pass (11 core/contract tests plus 3 scaffold tests); typecheck and lint pass. No live integrations or automatic external actions performed.

## 2026-10-29 — Phase 2 key-free scripted simulation

- Added gated synthetic frame/chat/audio/crew sources, bounded image-folder loading and an owned synthetic SVG fixture. Mock vision and chat classifier live in src/ai; observations drive pure core decisions.
- Added DemoSession with accelerated virtual time, ten-minute simulated baseline, combined alert, exposure replay, reversible simulated blur, moderation IDs, and separate click approvals for raid and tag back. No live integrations are called.
- Added simulation-only API controls, reset, in-memory image preview, one-second UI polling and a separate opt-in overlay endpoint that never exposes findability/clues.
- Built local dashboard/overlay/sensor pages using the Sites skill's local-only workflow; no hosted Site or deployment was created. Sensor explicitly states microphone work is pending.
- Browser QA: observed SIMULATED badge, approved raid → covered → request tag back → second approval → home; enabled HUD and verified the overlay exposes only energy/relay phase. Screenshot saved to /private/tmp/spotter-demo-dashboard.png.
- Bugs found: an unnecessary CSS data import broke Vite. Expanded the startup regression to fetch both compiled CSS and TS assets, observed failure, then removed the import.
- Verification: 19 tests pass; typecheck, lint and production build pass. Existing image fixtures are read into memory, never captured/stored by the model path. Real demo media, real Twitch/OBS/AI and live microphone remain pending.

## 2026-10-29 — Phase 3 Twitch implementation, human proof pending

- Consulted official dev.twitch.tv OAuth/refresh/validation, EventSub subscription/WebSocket and Helix reference pages before new endpoints.
- Implemented server-side authorization-code OAuth with expiring single-use state, local SQLite token storage, single-flight refresh, startup/hourly validation and a Connect with Twitch route. No Twitch credentials exist in this checkout; no real authorization occurred.
- Implemented plain-fetch Helix adapters (chat, markers, blocked terms, single-message delete, users/streams and raids). Missing message IDs throw rather than clearing all chat; no automatic write retry after errors.
- Implemented native WebSocket EventSub with five subscriptions, immediate parallel subscription requests, keepalive timeout, retry backoff, bounded dedupe, migration without duplicate subscriptions, revocation status and reconnect URL validation.
- Added live runtime that retains chat activity IDs only and shows aggregate velocity. Initialized private file permissions for server data. Live action UI is deferred to the module phases.
- Tests: OAuth state/refresh; Helix methods/query/body/error hygiene; EventSub subscription/deduplication/migration/keepalive; activity reduction without raw text. Fixtures are documentation-shaped synthetic values; Twitch CLI is not installed, so CLI-generated fixtures and real-channel proof remain HUMAN steps.
- User approved obs-websocket-js, pitchy and @fastify/websocket for upcoming module work; installed these dependencies now.

## 2026-10-29 — Phase 4 Off the Map implementation, live proof pending

- Used OpenAI Docs skill and opened official Responses Structured Outputs/image-input documentation; consulted the OBS WebSocket client reference.
- Implemented configured-model Responses calls with strict closed schemas, store:false, bounded in-memory image input, eight-second timeout, refusal/incomplete/error handling and runtime validation. Chat classifications contain only a boolean/confidence; vision descriptions remain generic allowlisted phrases.
- Added reconnecting OBS adapter with four-second capture orchestration (768px JPEG), privacy scene/filter application and exact previous-state restoration on dismissal. No captured image is persisted or sent to the overlay.
- Added OffTheMap module that invokes only core-decided actions, keeps the last score on analysis failure, bounds replay history and exposes action failures separately.
- Connected Chat Guard through the core moderation policy, with bounded classifier concurrency and a SQLite intent/outcome audit by message ID before deletion. The private audit is the mod notice; raw message text is not stored. Added private blocked-term add/remove controls; submitted sensitive terms are not retained by Spotter.
- Tests added before modules: Responses request contract/refusal, OffTheMap fail-soft/no repeat action/dismissal, OBS capture/restore/closed connection, Chat Guard missing-analysis/no deletion and ID-only audit.
- Verification: 28 tests pass; typecheck, lint and build pass. No real Twitch/OBS/OpenAI request was exercised; the HUMAN recorded take and credentials remain pending.

## 2026-10-29 — Phase 5 Second Wind implementation, microphone proof pending

- Consulted pitchy and Fastify WebSocket primary docs. Added Web Audio sensor activated only by its button, with processing constraints off, clarity-gated pitch, local spectrum/envelope features and numeric-only WebSocket packets. Stop/pagehide/server disconnect releases microphone tracks; SIM mode refuses mic activation.
- Added strict numeric packet parser, timestamp/rate/binary/size guards, single sensor connection and forced WebSocket termination on server shutdown.
- Strengthened calibration coverage after a failing sparse-sample test: ten-minute span plus at least 300 valid windows. Saved numeric baseline, stale-sensor status, recalibration, bounded rolling samples and half-minute aggregate report storage in SQLite.
- Added pure, tested rally progression separate from energy and pure session report summaries; wired opt-in overlay stamina/rally and combined alert. Added report page and energy/chat curves.
- Tests added before core/modules: numeric-only contract, sparse calibration, 150 Hz synthetic tone extraction, baseline persistence/staleness, rally separation/dedupe, reports and WebSocket accept/reject. Fixed a 30-second shutdown tail discovered in injected WebSocket testing by terminating sockets during preClose.
- Verification: 34 tests passed including the new WebSocket test; typecheck/lint/build pass. No real microphone opened, no raw audio recorded/uploaded; real microphone/browser permission and live correlation proof remain HUMAN work.

## 2026-10-29 — Phase 6 Tag Out implementation, real raid proof pending

- Added authenticated loopback crew status polling that shares only energy/live status. Crew secrets/config stay under ignored data/; each broadcaster keeps their own OAuth token and approves actions in their own instance.
- Extended core tests before code for receiving a known crew raid, confirming tag back at home, and retrying failed cancellation. Implemented these state transitions without I/O.
- Added live relay orchestration: sustained low-energy suggestion, click-only approval, fresh Helix source/target live checks, token-owner guard through core, persisted request window, 90-second informational countdown and EventSub-only confirmation.
- Ambiguous write failures remain confirming with an explicit cancel path; no automatic retry or false success. Added persisted relay state keyed by broadcaster, proved recovery across restart and isolation when account identity changes.
- Added partner-side tag-back approval, cancel routes, crew config example and opt-in covering overlay. Display name comes from the raid event, never an inferred location.
- Tests: private/loopback crew transport and unavailable data, approval/live guards, uncertain request cancellation, persisted state/attempts and authenticated minimal status endpoint. Real two-channel raid/recording remains a HUMAN requirement.

## 2026-10-29 — Phase 7 offline polish and verification; human handoff

- Consolidated README with setup, architecture diagram, ethics/limitations, exact test count, Codex usage and explicit distinction between offline implementation and unproven live flows. Added docs/LIVE_CHECKLIST.md for credentials, Twitch CLI captures, real OBS/mic/raid recordings and submission. Repo visibility remains private.
- Added configurable exposure thresholds, stronger strict TypeScript unused checks, service-boundary/core-purity regression, private Host/origin guards and HUD state reflection. Public overlay hides stale measurements on API failure and hides its empty panel when disabled outside simulation.
- Added a core regression for a suggested partner losing energy before approval; outbound approval now revalidates that eligibility. The UI identifies the selected partner and exposes ambiguous request status.
- Browser QA: transparent root/body and no horizontal overflow at 1280x720; overlay also inspected at 1920x1080, viewport reset afterward. Report rendered; SIM refused microphone activation without opening permissions. Full demo raid/tag-back flow was previously exercised through clicks in phase 2.
- Live UI finding: demo report compared an incomplete initial chat window, showing +20% instead of the scripted decline. Added a failing regression and seeded the simulated window; report now visibly shows 20→12 messages/min (−40%). Rally remains separate from energy and provides a dashboard nudge.
- The new Host guard correctly rejected the old injected WS test client without a Host header. Updated that fixture to send a local Host and explicitly verified foreign Origin rejection.
- Final verification: npm test 45/45 pass; typecheck, lint, build and git diff --check pass. Tests run on Node 25.4.0. Browser artifacts remain outside the repository under /private/tmp.
- Required remaining work is HUMAN/external-state work: configure secrets locally, install Twitch CLI and capture fixtures, open/configure OBS, authorize two test channels, use owned media, verify/record all real flows, then video/submission. None of those has been represented as complete. Temporary QA servers are stopped at handoff.

## 2026-10-29 — Broadcast design and local-video vision calibration

- Request: make dashboard/OBS HUD fun to watch on video, configure vision detail (default high), feed a local IRL video through real vision without OBS and report each analyzed frame, and reconcile the README test count.
- Design files: shared/shell.ts, shared/style.css, shared/motion.ts, overlay/{index.html,main.ts,style.css}. Added an animated exposure dial/count, keyed clue-chip entrances, a private privacy wipe/shield tied to applied state, segmented game stamina, separate rally visuals, and a baton that follows outbound/return relay states. Reduced-motion preferences are respected. No decision/scoring policy was changed.
- Separated the overlay entry point from private dashboard rendering. It fetches only /api/overlay; its closed payload allows stamina/rally/relay metadata, never exposure/clues/privacy. Added returning direction to public relay metadata. SIMULATED remains visible, including when the HUD is disabled in demo mode.
- Added OPENAI_VISION_DETAIL=high with low/high/auto validation shared by the server and calibration CLI. All vision requests use this setting; no model name was introduced. Consulted the official OpenAI image-input documentation before changing the request contract.
- New files: src/media/local-video.ts, src/modules/offthemap/calibration.ts, scripts/calibrate.ts and test/calibration.test.ts. Added npm run calibrate with a local path/interval/frame cap/output stem. Existing ffmpeg/ffprobe extract 768px JPEGs through stdout into memory. No image files or audio are written/uploaded by this path; no OBS/Twitch client is instantiated.
- Calibration invokes the same ResponsesAI.vision, scoreFindability and decideExposure pipeline with media timestamps. Reports include per-sample score, availability, generic clues, configured detail/thresholds and hypothetical requests. They execute no actions and are labelled SIMULATED · REAL VISION for prerecorded input, or SIMULATED · MOCK VISION for explicit SIM=1 --mock. Private JSON/CSV/HTML contain no source filename/path, image data or raw model errors.
- Tests written before implementation: default/detail variants and invalid detail; timestamped calibration/fail-soft/no image retention; real local video decode plus CLI report outputs using mocked AI. Public HUD contract now rejects extra private presentation fields. Existing core tests remain unchanged because scoring/state decisions were reused.
- Browser QA: inspected new dashboard, confirmed private shield after replay, clicked raid/tag-back and observed baton-flight with returning=true, checked transparent/no-overflow HUD at 1920x1080 and 1280x720, and verified no exposure/clue/privacy DOM in the overlay. Viewport was reset. Screenshots are under /private/tmp/spotter-designed-*.png.
- End-to-end offline smoke: generated an owned silent synthetic MP4 outside the repo and ran the CLI with SIM=1 --mock. Reported media times 0/4000/8000/12000 ms and scores 12/45/77/100; only JSON/CSV/HTML reports were written to ignored data/mock-vision-check.*. Inspected the resulting HTML in the browser. No real API request or user IRL clip was used because neither clip nor credentials has been supplied.
- Verification: npm test reports 53 tests, 53 passing, 0 failing, 0 skipped; README now matches that observed output. Typecheck, lint, build and git diff --check pass. No dependency was added. README and docs/LIVE_CHECKLIST.md document the exact real-video command and remaining live proof.

## 2026-10-29 — Configurable Responses endpoint and OpenRouter routing

- Request: support direct OpenAI and OpenRouter via AI_BASE_URL, require supported parameters on OpenRouter, document prefixed model IDs and prove store:false/fail-soft behavior.
- Read BRIEF.md/AGENTS.md first. Consulted official OpenRouter Responses, provider routing and structured-output documentation. No dependency or core decision/scoring change was needed.
- src/ai/responses.ts now accepts baseURL, defaults to https://api.openai.com/v1, normalizes trailing slashes and appends /responses. Only the exact openrouter.ai hostname adds provider:{require_parameters:true}. Vision and chat classification both retain strict json_schema, image/detail configuration, store:false, runtime validation and the existing timeout/error path. Invalid URLs with unsupported schemes, embedded credentials or query/fragment are rejected before network I/O.
- Wired AI_BASE_URL through src/server.ts and scripts/calibrate.ts. Added its direct-OpenAI default to the ignored local .env without replacing an existing setting, and documented both endpoint/key configurations and OpenRouter's proveedor/modelo model-ID shape in .env.example and README. The existing OPENAI_API_KEY/OPENAI_MODEL names work for either selected service.
- Tests added before implementation in test/offthemap.test.ts: default OpenAI, explicit/trailing-slash URLs, OpenRouter/trailing-slash URLs, lookalike/custom hosts, vision and classifier bodies, provider omission outside OpenRouter, store:false/strict schema, invalid base URLs, and an actual ResponsesAI-to-OffTheMap HTTP 400 schema rejection that preserves score 93 and executes no new automatic action. Extended test/architecture.test.ts to cover OpenRouter adapter boundaries.
- Verification: npm test 61/61 passing, 0 failures/skips; typecheck, lint, build and git diff --check pass. README count updated from 53 to the observed 61. Local .env remains gitignored and no secrets were committed. No real OpenRouter/API request was made; provider rejection was tested with mocked transport.
