# Human setup and proof still required

Offline implementation does not establish the real-service definition of done. Do not mark these complete until the actual flow has been observed and recorded. Keep secrets in `.env`/ignored local data, never in this file or chat.

## Setup

- [x] Twitch dev app configured and primary account authorized with the six required scopes. Crew authorization remains separate.
- [x] Twitch CLI 1.1.24 installed; raid and online/offline fixtures generated with `event trigger --no-config` and fake IDs. CLI does not support chat; that fixture is a redacted controlled live EventSub event. See test/fixtures/twitch/README.md.
- [x] CLI mock-api server smoke: started locally on port 8087; GET /units/users returned 200 with 25 generated mock users; stopped afterward. This does not claim authenticated mock Helix endpoint coverage.
- [x] OBS WebSocket authenticated; `npm run obs:setup` created and read back `Main`/`Privacy`, looped media and 1080p browser sources. A real rerun created no duplicates. `.env` uses scene-switch privacy with no blur filter. Real privacy/restore and the client-link interruption are checked below.
- [x] AI endpoint, key and compatible vision/Structured Outputs model configured locally; actual local-video and live-OBS vision calls succeeded. Credential values were not inspected/displayed.
- [ ] Owned IRL footage and voice media available; avoid identifiable bystanders.
- [x] Codex session ID recorded from the current thread environment in CODEX_SESSION.md.

## Local video calibration before OBS

- [x] ffmpeg/ffprobe verified through actual decode and dashboard video encoding.
- [x] Real local-video calibration used high detail, configured model/key and 1280px width.
- [x] Prior real local-video calibration: 24/24 sampled frames available at a two-second interval, uncapped; private HTML/CSV/JSON and analysis remain in data/real-vision/. JPEGs stayed in memory.
- [x] Reviewed missing rows and crossings, compared 1280px/768px and retained provisional 60/80. This prerecorded calibration is labelled SIMULATED · REAL VISION and executes no OBS/Twitch action. Live OBS source overlay also labels recorded input SIMULATED.

## Record real flows

- [x] Primary OAuth authorization and real EventSub chat verified: a controlled API-sent message appeared as 1 message/min and 1 unique chatter/min on the dashboard. Channel offline; no simulation source used.
- [x] Restarted Spotter: stored authorization validated and real EventSub reconnected without repeating OAuth.
- [ ] Observe real expiry-driven token refresh and keepalive/network-failure recovery; these are covered by offline tests but were not forced in this live check.
- [x] While Twitch/OBS were live with the recorded clip in Main, real vision crossed 80 and OBS switched to Privacy. Marker creation initially returned 404; after the user enabled VOD and restarted their stream, automatic marker receipts matched Twitch readback. Captured model images stayed in memory; overlay payload excludes exposure/clues/private action metadata.
- [x] Dismiss restored the recorded previous scene Main (OBS readback). Fixed the observed busy-analysis dismissal refusal and added pending-analysis/pending-scene-RPC regression tests. This setup uses scene switching, no filter.
- [x] At the user signal, disconnected only Spotter's OBS WebSocket: eight checks over 14 seconds returned health 200, held score 54, showed analysis unavailable and added no timeline decisions or Twitch markers. Independent OBS readback showed Main still streaming; then reconnected Spotter.
- [x] Later, with OBS streaming=false and recording=false, restarted OBS to recover its stuck browser engine. Spotter stayed running and reconnected; the public HUD rendered afterward. The earlier live test remains a client-only interruption.
- [x] Saved a private segmented dashboard take (~1fps captures, no audio, 131.27s encoded H.264 1280×720) plus JSON evidence under ignored data/takes/offthemap-2026-10-29/. This is evidence footage, not the finished submission edit.
- [x] Added an artificial temporary blocked term through Spotter; from a non-moderator secondary account Twitch AutoMod displayed that the comment was held and not published. Removed the term through Spotter, then resent the same text: it reached EventSub as normal chat. Screenshots remain private in data/.
- [x] Sent a controlled location-guessing test without any actual place/name/address from the secondary account. Chat Guard deleted it; Twitch displayed the deletion and the private audit recorded action=delete, simulated=false, with ID/time only. No real chat text was persisted by the app.
- [ ] Force a real model failure and verify no live deletion; this fail-soft condition is covered by offline regression tests, not exercised against the live provider here.
- [ ] Explicitly enable the microphone; inspect numeric-only WebSocket packets. Calibrate with natural speaking for ten minutes, verify saved baseline, stop/disconnect behavior and missing-sensor display.
- [x] Calibrated the SIMULATED file source with 11:00 looped TTS audio through the shared microphone extractor; saved a separate numeric baseline. Original 81.48s and extended 141.48s demos measured median 74→56, minimum55. Original PCM prefix preserved; repeating the last30s twice did not improve the plateau. Audio/reports remain ignored in data/.
- [x] Three explicitly authorized real Twitch test messages were accepted and counted by EventSub (1/2/3); original run paired correlation ≈−0.864. Controlled test chat, not organic engagement or causation; no synthetic chat numbers injected. Rally remains separate from energy (unit test).
- [x] HUD opt-in and numeric SIMULATED stamina rendered in the real OBS browser source after recovering its stuck browser engine by restarting OBS with both outputs stopped. Real OBS vision was available during the audio replay; public payload contains no exposure/clues.
- [x] Demonstrated the combined alert with deliberately processed SIMULATED file audio plus real OBS IRL vision. The untouched169.48s three-part concatenation reached55; volume/atempo/extra-pauses variant46; filtered PCM16 variant45; final float32/progressive-tail variant44 for44.236 continuous seconds below45. Replayed its final80s (including a three-repeat capture loop) to align with actual exposure≥60; API receipts44/66 and44/73, private dashboard screenshot44/60 with CHECK YOUR RESERVE, real OBS HUD44/Main playing. No score, baseline or threshold changed. Processing is synthetic input engineering, not natural fatigue validation; natural microphone verification remains separate. Private reports/screenshots stay in data/.
- [x] Second instance configured on API3220/Vite5174 with separate SQLite, alredio OAuth and reciprocal private crew files/shared secret under data/. Authenticated endpoints share only energy/live. Main remains3210/5173; companion OBS/AI automation disabled. Same numeric file baseline copied unchanged for the same voice. Vite private-data HTTP exposure reproduced with a dummy file and fixed/tested.
- [x] Both owned channels live in separate OBS profiles: automatic suggestion at energy44, partner≈71–74; click-approved pending raid canceled successfully. Manual Pedir relevo then separate approval; Twitch native countdown showed2raiders; EventSub confirmed covered on both. Receiver Covering for silemntarcher rendered through a temporary public-only HUD bridge because secondary CEF was blank. No stream outputs interrupted. Evidence/video/metrics remain private in data/takes/tagout-2026-10-29/. Prolonged SIMULATED input stayed<45 for757.414s; score/calibration unchanged.
- [ ] Tag back requested and approved from alredio, but Twitch rejected it with400/raid_target_restrictions. Confirmed no pending raid; no duplicate retry or fabricated home state. alredio was created2026-10-29; target minimum age is30days and user could not lower it. User paused the test; resume with an eligible account/new valid relay cycle. Both channels were already offline at cleanup. See TAGOUT_HANDOFF.md.

## Submission — user action

- [ ] Record/edit a video of at most 3:00 with no copyrighted music. Keep SIMULATED visible on all mock scenes.
- [ ] Upload video and prepare Devpost details, test evidence, Codex log/session ID and repository URL.
- [ ] Repository remains private as requested. Decide access/publication explicitly when preparing the submission; no automatic visibility change was made.
- [ ] Confirm the organizer's actual deadline/timezone against the official rules before submitting; the plan's deadline text has not been independently verified.
