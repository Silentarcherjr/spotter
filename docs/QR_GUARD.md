# QR Guard — feasibility before implementation

Status 2026-11-01: real OBS feasibility verified after the user opened OBS. No QR detector, automatic QR decision path or QR-related OBS configuration is enabled. Off the Map scores/thresholds are unchanged.

The official [OBS Render Delay guide](https://obsproject.com/kb/render-delay-filter/) describes a video-rendering delay. The [stock filter implementation](https://github.com/obsproject/obs-studio/blob/master/plugins/obs-filters/gpu-delay.c) exposes delay_ms from0 to500ms. This delays video, not automatically the matching audio; any final setup needs an audio-sync check.

The [obs-websocket screenshot request](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md#getsourcescreenshot) selects a source and image size/format. There is no bypass-filters argument. The [official implementation](https://github.com/obsproject/obs-websocket/blob/master/src/requesthandler/RequestHandler_Sources.cpp) renders the requested source. Therefore the candidate topology is an unfiltered child video source captured privately, inside a Main scene with Render Delay. Applying delay directly to the captured source would also affect its screenshots. The empirical synthetic-color test below confirms the source/scene separation on this machine; it does not yet demonstrate QR protection.

## Reversible test

Run npm run qr:obs-probe with OBS open, its WebSocket enabled and streaming/recording stopped. The script isolates Spotter's existing OBS client when connected to avoid AI sampling of the probe. It then:

- Refuses existing active Main filters or collisions with its temporary names.
- Adds a full-canvas built-in color source to Main and a500ms gpu_delay filter on Main.
- Measures50 GetSourceScreenshot JPEG round trips at1280px, excluding image decoding.
- Alternates synthetic colors8 times and polls the raw source and delayed Main using PNGs in parallel. Reads only their first RGB pixel in memory; no image or QR content is retained. Reports time-to-observed-color and observed lead, with maximum polling-duration uncertainty. Those poll timings include PNG capture, unlike the JPEG-only round-trip metric.
- Restores the original program scene and removes only its temporary input/filter, including on handled interruption. Starts/stops no stream or recording output. Stores numeric metadata in data/takes/qr-guard/obs-probe.json only after successful cleanup.

A positive lead would establish a useful source/scene separation in the controlled probe, not a prevention guarantee. Final QR protection must account for the phase until the next capture, screenshot completion, image preprocessing, detection, code decision, OBS RPC and the actual transition cut point. Detection→scene latency alone omits earlier costs. A fade can still expose buffered frames after a scene-assignment acknowledgement. Final evidence must compare the entire path against the observed buffer delay and verify pixels in the real Twitch player.

Pending: real source/scene separation and timing results; explicit approval for any detector dependency; detection-only API review (discarding decoded text is not equivalent to never decoding); deterministic QR decision tests; action ownership with Off the Map; local accuracy/latency evaluation; real stream/player test. The user will be asked to start streaming only when those checks are ready. Privacy/public overlay will not identify the QR reason.

## Phase1 measured result (2026-11-01 Panama)

OBS33.0.0 / obs-websocket5.7.6 accepted gpu_delay on Main, enabled at500ms. An unfiltered child color source was captured ahead of delayed Main in all8 controlled color transitions. Observed lead: median441.44ms, p95475.72ms, range406.61–475.72ms. Poll cycles took up to41.79ms; these are observed first-color timestamps, not sub-frame exact buffer measurements. Full-color probe JPEG1280px capture RPC: median7.87ms, p9510.46ms, n50. Uniform colors compress cheaply, so these are not yet a natural-video throughput claim. The source/scene comparison uses PNG and includes separate request costs.

Original scene Privacy restored; temporary source/filter removed; no output started/stopped. Evidence is numeric-only in ignored data/takes/qr-guard/obs-probe.json. Candidate design proceeds with delay on Main and capture of the undelayed child; do not put the render delay on the child used by the detector. The remaining total budget must include capture phase/processing and an effective privacy cut. No claim that QR never reaches Twitch is made at this stage.
