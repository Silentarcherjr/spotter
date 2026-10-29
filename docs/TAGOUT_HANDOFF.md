# Tag Out — paused at user request, 2026-10-29

Verified live: two distinct owned channels, automatic suggestion from measured SIMULATED low audio, manual Pedir relevo, separate click approval, successful pending-raid cancellation, Twitch-native countdown with2raiders, actual outbound EventSub confirmation on both instances, and receiver “Covering for silemntarcher’s community”.

Not verified: successful tag back/home confirmation. Twitch returned400 (static category raid_target_restrictions). The user found a minimum30-day raider-account age; public Get Users confirmed alredio was created2026-10-29T14:14:53Z. The user could not lower that minimum and may use an older account when resuming. No raid remains queued/counting down. Final saved states: principal covered; companion tag-back. Do not mark home without the matching real EventSub event.

The user stopped both broadcasts before cleanup. We stopped test audio/recorders, disabled HUDs and temporary bridge sources, disconnected vision and stopped both Spotter dev servers. OBS applications were left untouched; neither stream was stopped by an agent command.

## Stored local setup (never print secret files)

- Main: silemntarcher, Twitch ID714995976, API3210, Vite5173, data/spotter.sqlite.
- Companion: alredio, ID1597845490, API3220, Vite5174, data/crew/secondary.sqlite.
- data/crew/shared-secret, primary-crew.json and secondary-crew.json: mode600, ignored by Git and blocked from Vite HTTP access.
- OBS primary port4455. Secondary port4456/profile+collection Spotter - alredio, browser URL5174. The user configured the stream credentials privately. Do not read stream service/key settings.
- Numeric file baseline copied unchanged for the same TTS voice; no recalibration or score change. Primary file baseline hash8031ec4000dc3e4c317fa297e18b26fea61dad6db01fb075107140f3138a5ff7.
- TAGOUT_ENERGY_THRESHOLD default45, strictly below; TAGOUT_SUSTAIN_S default60. Partner still needs live+energy>=60. Manual request bypasses only the personal-energy hold; no automatic raid.

## Resume carefully

1. Read BRIEF/AGENTS and this handoff. Start npm run crew:dev -- primary and npm run crew:dev -- secondary. Existing OAuth persists. Each identity must remain distinct; npm run crew:link rebuilds reciprocal files internally, then restart the instances to load them.
2. If using an older different companion account, authorize it on3220 and relink. The saved old relay is paired with alredio: prepare a **new valid cycle** through an explicit tested abandonment/reset path before another outbound raid. Do not edit SQLite to fake a received raid or a home confirmation. Otherwise the existing partner IDs cannot prove a return from the new account.
3. OBS secondary already exists; avoid launching a third process. npm run obs:secondary -- --launch is only for when it is closed. Setup refuses profile changes during active outputs. Any stream credential change stays with the user.
4. Secondary native browser rendering failed. Temporary npm run obs:hud-bridge renders the real public receiver overlay off canvas in the working primary OBS and updates a transparent secondary image source. No camera/vision frame retention. The bridge must run for live updates. Afterward stop it and run npm run obs:hud-bridge -- --stop. Underlying dual-OBS CEF issue remains unresolved.
5. Restart local SIMULATED file playback for both numeric feeds (same extractor as mic). data/audio/demo-fatiga-tagout-extendida.wav is311.960917s; demo-tagout-session.wav is900s with the processed final30s repeated. The original processed beginning is preserved; this changes input only. demo-crew-high.wav loops the original reference for1200s. Files must be selected locally; no raw audio upload. An automated cross-origin iframe chooser failed; direct sensor tabs worked.
6. Ask the user to start both broadcasts only when configured. All raids require actual UI approval. Cancel a pending raid before retrying an ambiguous response. Definite4xx errors require a fresh click; network/5xx/409 stays pending. Cancellation404 means no pending raid and does not establish home.

## Evidence

Private data/takes/tagout-2026-10-29/: segmented H.264 dashboard videos, source screenshots, Twitch-native countdown crop, allowlisted relay observations, summary.json and paused-handoff.json. No audio/chat/token/key content is logged by the monitor. Screenshots record public HUD/private dashboard evidence, not images sent to vision. Screenshot bytes from the browser were JPEG despite the initial .png name; files were renamed by signature and encoded using their actual capture timestamps.

Tests at pause:105/105 passing; typecheck/lint/build verified. No dependency added. Future work must preserve SIMULATED labels, private exposure/clues and click approvals.
