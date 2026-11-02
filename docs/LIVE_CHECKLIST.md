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
- [x] Replacement companion elsilentarcher authorized on3220; public account creation2020-02-19 and six scopes verified. Reciprocal crew linked to493713410. Both previous unfinished cycles archived while offline through the tested retirement path; idle is not home confirmation. Existing secondary OBS credentials changed privately by the user. New live return completed below.
- [x] New complete real cycle with elsilentarcher (account created2020): automatic suggestion at primary44/partner≈71–83, click-approved outbound, native Twitch countdown with2raiders, actual EventSub covered on both and receiver OBS Covering for. Requested/approved tag back from the companion dashboard; Twitch native countdown again showed2raiders, chat redirected home and both instances reached HOME through actual matching EventSub. Final countdowns null, no pending raid. Primary stayed<45 for at least345.668s in this capture. Alredio served as spectator. Private screenshots, three segmented dashboard videos and allowlisted receipts in data/takes/tagout-resume-2026-10-29/. The previous failed return with the young alredio account remains historical evidence, not the final outcome.

## Final recording design

- [x]1920×1080 recording layout (?record=1) verified with all six cards and both alerts, no page/card clipping, and no visible dashboard text below14px. Ten fresh design PNGs remain ignored in data/screens/.
- [x] Separately labelled measured takes available in dashboard/report, actual time axes and observed-event annotations; correlation hidden below20 valid pairs or without variance, otherwise two decimals/n. No chat inferred for the relay recording.
- [x] Real private Frame Monitor memory endpoint checked against actual OBS/vision using metadata only; no analyzed frame saved. Mocked adapter regression verifies successful frame delivery, public-payload exclusion and clearing on disconnect. No live screenshot of the analyzed frame was taken.
- [x] Production src/core/ scoring/calibration/thresholds unchanged. Only simulated input script and presentation changed;117 automated tests pass. Display name resolution and successful-only privacy annotations covered.

## Submission — user action

- [ ] Record/edit a video of at most 3:00 with no copyrighted music. Keep SIMULATED visible on all mock scenes.
- [ ] Upload video and prepare Devpost details, test evidence, Codex log/session ID and repository URL.
- [ ] Repository remains private as requested. Decide access/publication explicitly when preparing the submission; no automatic visibility change was made.
- [ ] Confirm the organizer's actual deadline/timezone against the official rules before submitting; the plan's deadline text has not been independently verified.

## QR Guard — 2026-11-01

- [x] Stock OBS Main render-delay500ms / undelayed child topology verified with8 color transitions; no third-party plugin. Capture1280px n50 and real QR capture→scene n20 measured separately.
- [x] Local geometry-only detector, pure K/N/M/Dismiss policy, privacy ownership, fail-soft handling and payload-exclusion regressions. Default real path150ms,1 hit,~2s clean recovery; Off the Map score/thresholds untouched.
- [x] Development evaluation32/36 positive cases,0/24 IRL false positives; tiny/rotated misses and same-set tuning disclosed in EVAL.md. Private QR indicator/latency and generic audit implemented; public UI unchanged.
- [ ] Twitch player proof with protected/control/rearmed windows and actual stream marker. Primary stream must be started by user; do not infer viewer protection from OBS command timing.
- [ ] Valid private dashboard+player video. Secondary browser and diagnostic movie were black, so excluded as evidence. Blank-composition recording refusal tested; native single-window fallback prepared, awaiting unlocked Mac for verification.
- [x] First QR Twitch trial: real live status and automatic stream-marker receipts confirmed; private native-window recordings captured at1920×1080/60fps. Main's transparent Render Delay output invalidated the positive control, so movies are diagnostic/inconclusive, not proof of preventing exposure.
- [x] User stopped the primary stream; temporary probe sources/filters removed and recorder settings restored. Restarting the stopped primary OBS recovered delayed video and clean restoration. New regression rejects transparent Main despite a matching scene name; no image persistence.
- [x] Post-restart moving-QR benchmark20 protections/recoveries: capture→scene median71.99ms,p9582.42ms; detection→scene7.40ms,p959.38ms.158 tests, typecheck,lint and build pass. Another actual player test with a successful visible positive control remains required.
- [x] Replaced repeated buffer reset with continuously rendered Main hidden below an opaque stock color in Privacy. Layout/normal blend/filter/cycle regressions and minimum elapsed clean-buffer test pass; default M and all Off the Map scores/thresholds unchanged.20 moving-code cycles: capture→scene70.82ms median/92.93ms p95, detection→scene10.47ms/12.87ms.12/12 later samples spanning Main and Privacy opaque. Silent inputs only; continued media/audio activity during Privacy is disclosed.
- [x] Supplied videos screened locally at5fps:4/52 and9/38 detections at1280,9/52 and13/38 at1920;0unavailable. Unlabelled screening, not recall. QR content never decoded, frames not saved/sent to AI, source videos ignored and not broadcast.
