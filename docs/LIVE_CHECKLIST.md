# Human setup and proof still required

Offline implementation does not establish the real-service definition of done. Do not mark these complete until the actual flow has been observed and recorded. Keep secrets in `.env`/ignored local data, never in this file or chat.

## Setup

- [x] Twitch dev app configured and primary account authorized with the six required scopes. Crew authorization remains separate.
- [x] Twitch CLI 1.1.24 installed; raid and online/offline fixtures generated with `event trigger --no-config` and fake IDs. CLI does not support chat; that fixture is a redacted controlled live EventSub event. See test/fixtures/twitch/README.md.
- [x] CLI mock-api server smoke: started locally on port 8087; GET /units/users returned 200 with 25 generated mock users; stopped afterward. This does not claim authenticated mock Helix endpoint coverage.
- [x] OBS WebSocket authenticated; `npm run obs:setup` created and read back `Main`/`Privacy`, looped media and 1080p browser sources. A real rerun created no duplicates. `.env` uses scene-switch privacy with no blur filter. Automatic privacy/restore recording below remains pending.
- [ ] OpenAI key and compatible image/Structured Outputs model set in `.env`.
- [ ] Owned IRL footage and voice media available; avoid identifiable bystanders.
- [x] Codex session ID recorded from the current thread environment in CODEX_SESSION.md.

## Local video calibration before OBS

- [ ] Ensure `ffmpeg` and `ffprobe` are available on PATH (already present on the development host).
- [ ] Set `OPENAI_VISION_DETAIL=high` and the real API key/model in `.env`.
- [ ] Run `npm run calibrate -- --video "/absolute/path/to/owned-clip.mp4" --output data/irl-calibration`; review the private HTML/CSV/JSON score report. All sampled frames use media timestamps; JPEGs stay in memory. Check whether the sample cap was reached.
- [ ] Inspect unavailable rows separately from valid low scores, compare threshold crossings, adjust `.env` warning/action thresholds and repeat as needed. This prerecorded input is labelled SIMULATED · REAL VISION and executes no OBS/Twitch action.

## Record real flows

- [x] Primary OAuth authorization and real EventSub chat verified: a controlled API-sent message appeared as 1 message/min and 1 unique chatter/min on the dashboard. Channel offline; no simulation source used.
- [x] Restarted Spotter: stored authorization validated and real EventSub reconnected without repeating OAuth.
- [ ] Observe real expiry-driven token refresh and keepalive/network-failure recovery; these are covered by offline tests but were not forced in this live check.
- [ ] Play owned footage in OBS. Generic clues increase the private score, privacy scene/filter applies, marker appears. Confirm no frame files are produced and overlay exposes no clue/score.
- [ ] Dismiss privacy and verify the exact previous scene/filter state. Close OBS and confirm the server survives and shows analysis unavailable without a new action.
- [x] Added an artificial temporary blocked term through Spotter; from a non-moderator secondary account Twitch AutoMod displayed that the comment was held and not published. Removed the term through Spotter, then resent the same text: it reached EventSub as normal chat. Screenshots remain private in data/.
- [x] Sent a controlled location-guessing test without any actual place/name/address from the secondary account. Chat Guard deleted it; Twitch displayed the deletion and the private audit recorded action=delete, simulated=false, with ID/time only. No real chat text was persisted by the app.
- [ ] Force a real model failure and verify no live deletion; this fail-soft condition is covered by offline regression tests, not exercised against the live provider here.
- [ ] Explicitly enable the microphone; inspect numeric-only WebSocket packets. Calibrate with natural speaking for ten minutes, verify saved baseline, stop/disconnect behavior and missing-sensor display.
- [ ] Compare measured energy and real chat curves; verify rally never changes energy. Enable/disable HUD and check transparency/visibility in OBS.
- [ ] Configure the second local instance, separate database/ports and partner OAuth token. Each crew endpoint must expose only energy/live after its shared secret.
- [ ] With both channels live, approve an actual raid. Confirm Twitch countdown, EventSub coverage and receiving overlay. Cancel a test pending raid.
- [ ] Request/approve tag back from the partner's dashboard and verify home confirmation. Record the real two-channel flow.

## Submission — user action

- [ ] Record/edit a video of at most 3:00 with no copyrighted music. Keep SIMULATED visible on all mock scenes.
- [ ] Upload video and prepare Devpost details, test evidence, Codex log/session ID and repository URL.
- [ ] Repository remains private as requested. Decide access/publication explicitly when preparing the submission; no automatic visibility change was made.
- [ ] Confirm the organizer's actual deadline/timezone against the official rules before submitting; the plan's deadline text has not been independently verified.
