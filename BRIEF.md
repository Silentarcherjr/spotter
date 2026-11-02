# Spotter — the AI that watches the streamer's back

> Working name. Built for the Codex x TwitchCon Hackathon (deadline Nov 2, 2026, 2:00pm PST).

## One-line pitch

Most Twitch tools watch the chat. **Spotter watches the streamer**: how exposed they are (Off the Map), how much energy they have left (Second Wind), and who can cover for them when they need a break (Tag Out).

## Why it matters

- **Innovation:** Existing privacy tools (StreamSafe, PrivaStream) only blur faces, plates or personal text; none reasons about how *findable* a streamer is from the frame as a whole.
- **Impact:** IRL safety is a live concern for Twitch (TwitchCon 2026 added no-filming zones and lanyards). Burnout affects every streamer. Every streamer can use the energy module daily; IRL streamers use the whole tool on every outing.
- **Tech:** Real-time vision + audio analysis, Twitch EventSub, Helix moderation, raids, OBS automation, with a deterministic, tested decision core.
- **Design:** Three visual moments a viewer understands in 10 seconds (findability meter climbing, stamina bar draining, a raid baton passing between two streams).

## Core rule: observations from the model, decisions from tested code

Models only return structured observations (clues, confidences, classifications). All scores, thresholds and actions are pure TypeScript with unit tests. No model output ever triggers an action directly.

## Ethics rules (non-negotiable, say them in the pitch)

1. **Spotter never outputs a location.** The vision prompt asks for *identifying clues*, never for a place. The output schema has no location field. Clue descriptions are generic ("readable street sign", "transit route number visible"), never the text itself.
2. **Everything is private to the streamer.** The findability score, clues and energy data are shown only on the streamer's dashboard unless they opt in to a public HUD.
3. **Local first.** Audio never leaves the machine; only numeric features are kept. Frames sent to the vision model are not stored.
4. **Advisory, not a guarantee.** A safety net, not a guarantee. A low score is labelled "no obvious clues detected", never "safe".
5. **Honest demo.** Any simulated input shows a visible `SIMULATED` badge.

---

## Module 1 (hero): Off the Map

**What it does**
- Samples a frame of the program output every 3–5 s via obs-websocket `GetSourceScreenshot`.
- Vision model (OpenAI Responses API, structured output) returns a list of clues: `{category, description, severity 1-5, confidence 0-1}`. Categories: `street_sign`, `storefront`, `transit`, `landmark`, `license_plate`, `house_number`, `skyline`, `vehicle_marking`, `reflection`, `other`.
- `scoreFindability(clues, history)` (pure code) computes a 0–100 score with decay over time (clues seen across several frames add up: combinations are what locate people).
- Thresholds (configurable): ≥60 warn privately; ≥80 act: switch to the "Privacy" scene or enable a blur filter (`SetSourceFilterEnabled`), and drop a stream marker.
- **Chat Guard:** the streamer privately lists sensitive terms (neighbourhood, nearby streets, landmarks). Spotter pushes them as Twitch **Blocked Terms** (Helix, so Twitch blocks them before display). For paraphrased guesses ("is that the 7-Eleven by the bridge?"), an LLM classifier flags "location-guessing" messages and Spotter flags them privately for mods by default; automatic deletion (Helix Delete Chat Messages) is an explicit opt-in.
- **Exposure replay:** after an alert, the dashboard shows which clues raised the score and when.

**Demo moment:** IRL footage walks down a street. Meter 12 → 47 → 87 ("storefront + transit route + reflection"). Scene auto-blurs. A planted chat message naming the street disappears. The replay shows what gave it away.

## Module 2: Second Wind

**What it does**
- Browser sensor page reads the mic (Web Audio, `echoCancellation/noiseSuppression/autoGainControl: false`). Features per 1 s window: RMS loudness, F0 median and range (pitchy, clarity-gated), spectral slope, voiced ratio, pause length, rough speech rate (energy-envelope peaks).
- Baseline: first 10 minutes of the stream (or a saved profile). Energy score = smoothed weighted z-scores vs the streamer's own baseline (30–60 s windows). Never called "fatigue".
- Chat activity from EventSub `channel.chat.message` (messages/min, unique chatters/min).
- **Live correlation panel:** "When your energy dropped 30%, chat dropped 40%" (computed from this stream's own data).
- **Stamina HUD (opt-in, public):** a playful bar on stream. **Rally:** chat messages fill a separate rally meter; a full rally triggers a celebration and a nudge to the streamer. The rally does not change the measurement.
- **Combined alert:** low energy + high exposure (IRL) → "You're tired and exposed. Consider moving or taking a break."
- **End-of-stream report:** energy curve vs chat curve, when you peaked, when you faded.

## Module 3: Tag Out (relay raid)

**What it does**
- A "crew" of streamers who authorised Spotter shares only an energy level and live status.
- When the streamer's energy stays low, Spotter suggests the crew member who is live **and** has high energy. One click → Helix Start a Raid (`channel:manage:raids`). Twitch then runs its 90 s raid countdown; Spotter confirms with EventSub `channel.raid`.
- The receiving streamer's overlay shows "Covering for <name>'s community".
- When the first streamer is back and live, "Tag back" raids the community home (from the partner's token, with the partner's one-click approval).
- Limits to respect: both channels must be live; raid rate limit (10 per 10 min); target raid settings can block; only the broadcaster's own token can raid.

**Demo:** two test channels you control (or one real + one clearly labelled simulated partner).

---

## Twitch surfaces used

- OAuth (Device Code flow or authorization code on localhost).
- EventSub WebSocket: `channel.chat.message`, `channel.raid`, `stream.online`, `stream.offline`.
- Helix: Add/Remove Blocked Terms, Delete Chat Messages, Send Chat Message, Start/Cancel a Raid, Create Stream Marker, Get Users.
- Scopes: `user:read:chat`, `user:write:chat`, `moderator:manage:blocked_terms`, `moderator:manage:chat_messages`, `channel:manage:raids`, `channel:manage:broadcast` (markers).
- OBS: obs-websocket 5 (`GetSourceScreenshot`, `SetCurrentProgramScene`, `SetSourceFilterEnabled`).
- Works on any channel: nothing requires Affiliate/Partner.

## Simulation mode (for the demo and for judges)

- `SIM=1`: frames from a recorded IRL clip; audio from a recorded voice clip with gradual energy decay; synthetic chat injector; Twitch CLI mock events; a simulated crew partner.
- Every simulated source shows a `SIMULATED` badge on overlay and dashboard.
- The video must still show real Twitch integration (real chat on a test channel, real blocked term, real deletion, real marker; real raid if two accounts are available).

## Out of scope

Webcam analysis, ML training, mobile app, hosted multi-tenant service, Twitch Extension review.

## Success criteria (definition of done)

- One command starts server + dashboard + overlay; `npm test` passes; `npm run demo` runs the full scripted demo with no keys (mock vision/LLM).
- Off the Map, Second Wind and Tag Out each work end to end on a real Twitch test channel at least once (recorded).
- README with setup, architecture diagram, ethics rules, limitations, and how Codex was used.
- `docs/codex-log.md` with dated entries; Codex session ID recorded.
