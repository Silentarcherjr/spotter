# Human setup and proof still required

Offline implementation does not establish the real-service definition of done. Do not mark these complete until the actual flow has been observed and recorded. Keep secrets in `.env`/ignored local data, never in this file or chat.

## Setup

- [ ] Twitch dev app: client ID/secret and localhost redirect URI configured; main and crew test accounts available.
- [ ] Twitch CLI installed using the [official instructions](https://dev.twitch.tv/docs/cli/). Produce fixture events with `event trigger` and exercise `mock-api`; sanitize tokens/text before committing captures. Existing automated fixtures are synthetic documentation shapes.
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

- [ ] Authorize Twitch; dashboard chat rate reflects real messages. Restart and verify token validation/refresh and EventSub recovery.
- [ ] Play owned footage in OBS. Generic clues increase the private score, privacy scene/filter applies, marker appears. Confirm no frame files are produced and overlay exposes no clue/score.
- [ ] Dismiss privacy and verify the exact previous scene/filter state. Close OBS and confirm the server survives and shows analysis unavailable without a new action.
- [ ] Add a private blocked term; verify Twitch blocks it and the returned ID can remove it.
- [ ] Manually post a controlled guessing test message on your test channel; observe deletion and the private ID/outcome audit. Verify model failure causes no deletion.
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
