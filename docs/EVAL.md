# Small authored evaluation — 2026-10-30T05:37:06.371Z

Model: `openai/gpt-4.1-mini`; detail high; 1280×720 authored PNGs. Dataset SHA-256: `ec3710e8f14bb2737d2772c9ef049c473c046e00a505a6a7bded3a91acd9d79c`.

30 original procedural scenes and 40 original EN/ES chat messages, CC0; labels fixed before inference. Fictional identifiers only, no real places. Source: test/fixtures/eval/; renderer: scripts/generate-eval.py (Pillow, only needed to regenerate assets). npm run eval uses the existing configured real API and costs money; npm run eval -- --validate checks the frozen dataset offline. Per-case results stay in ignored data/eval/.

| Task | n | TP | FP | FN | TN | unavailable | Precision | Recall |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| exposure60 | 30 | 10 | 0 | 10 | 10 | 0 | 100.0% | 50.0% |
| exposure80 | 30 | 6 | 1 | 4 | 19 | 0 | 85.7% | 60.0% |
| clueCategoriesMicro | 300 | 45 | 25 | 15 | 215 | 0 | 64.3% | 75.0% |
| chatClassifier | 40 | 20 | 0 | 0 | 20 | 0 | 100.0% | 100.0% |
| chatModeration80 | 40 | 20 | 0 | 0 | 20 | 0 | 100.0% | 100.0% |

Rows are actual positive/negative and columns predicted positive/negative: [[TP,FN],[FP,TN]]. Unavailable cases are excluded from precision/recall and reported separately, never classified as safe. Undefined denominators are shown explicitly. Category micro metrics cover 30×10 binary category targets.

Gold warning: two independent readable fictional identifiers; gold action: multiple independent identifiers; negative: generic scenery/signage. Exposure metrics apply the unchanged score independently to each frame with empty history at 60/80. This diagnostic is NOT an evaluation of temporal accumulation or real-world safety. Chat classifier uses guessing; chatModeration80 additionally uses the existing confidence ≥0.8 eligibility policy (flag by default, delete only with explicit opt-in).

Limitations: small, balanced synthetic development set, author-labelled without independent adjudication, multiple variants of the same procedural scene; this original standalone section has no natural holdout, and the appended extension reports natural data separately. Model nondeterminism and provider routing can change reruns. Precision depends on prevalence. No threshold is changed by this command; missed clues require a licensed natural-clip holdout and label review before recommending a threshold. No safety guarantee.


## Temporal sequences and natural holdout — 2026-10-30T16:47:29.283Z

Model `openai/gpt-4.1-mini`, high detail, 1280 px, unchanged prompts, score and thresholds. Labels frozen at 2026-10-30T16:44:51.730Z, before any inference on this natural dataset. Freeze-manifest SHA-256: `3d0652debd2c6690aa6db3f8bb0dc2b7843f66cbd3eb564c466c32ad6e72aea5`. Labels SHA-256: `859750f8b7c1a8b0aff3bef55a9d57b783a105c7bc4525fb7eb8772ff944d6d7`. Tracked manifests in test/fixtures/eval-temporal/ publish per-clip and per-encoded-frame hashes, generic labels, timestamps and sequence membership. Source videos stay ignored in data/eval/natural/; extracted natural frames are NEVER saved.

12 sequences ×10 frames:9 synthetic development sequences at4s cadence and3 chronological natural sequences. Natural cadences: facade2s, trail4s, short street clip1s (sensitivity experiment, not the default4s production cadence). Each sequence starts with empty history, then calls the actual scoreFindability and decideExposure with the full120s history and existing30s decay. Tests compare replay to OffTheMap production runtime. This is offline observation replay: model latency, busy-sample skips and OBS/player delay are not simulated; selected input cadence is not a wall-clock throughput claim. Positive means at least one actual privacy decision at80 on available evidence; unavailable frames retain the prior score without taking an action. Without a crossing, any unavailable frame makes the sequence prediction unknown.

| Task | n | TP | FP | FN | TN | unavailable | Precision | Recall |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sequencesAll80 | 12 | 4 | 0 | 2 | 6 | 0 | 100.0% | 66.7% |
| sequencesSynthetic80 | 9 | 3 | 0 | 2 | 4 | 0 | 100.0% | 60.0% |
| sequencesNatural80 | 3 | 1 | 0 | 0 | 2 | 0 | 100.0% | 100.0% |
| naturalFrames60 | 18 | 2 | 0 | 4 | 12 | 0 | 100.0% | 33.3% |
| naturalFrames80 | 18 | 0 | 0 | 2 | 16 | 0 | undefined | 0.0% |

| Sequence | Source | Pre-inference label | Result | Peak | First crossing |
|---|---|---|---|---:|---:|
| s-generic | synthetic | no obvious identifying combination | no crossing | 29 | — |
| s-generic-reverse | synthetic | no obvious identifying combination | no crossing | 31 | — |
| s-generic-repeat | synthetic | no obvious identifying combination | no crossing | 6 | — |
| s-generic-alternate | synthetic | no obvious identifying combination | no crossing | 23 | — |
| s-two-identifiers | synthetic | risk | no crossing | 75 | — |
| s-multiple-identifiers | synthetic | risk | crossed 80 | 100 | 0s |
| s-gradual | synthetic | risk | crossed 80 | 100 | 32s |
| s-late-evidence | synthetic | risk | crossed 80 | 100 | 32s |
| s-identifiers-repeat | synthetic | risk | no crossing | 34 | — |
| n-facade | natural | no obvious identifying combination | no crossing | 70 | — |
| n-trail | natural | no obvious identifying combination | no crossing | 14 | — |
| n-street | natural | risk | crossed 80 | 86 | 2s |

Natural standalone holdout:18 frames (6 per newly downloaded source), evaluated with empty history separately from synthetic results. Gold warning means clearly readable identifying evidence; gold action means independent readable identifiers in at least two categories. Sequence labels instead judge the cumulative identifying combination over the whole sequence. The street sequence is positive from the initial storefront/plate evidence; the facade and forest sequences are negative. These are author visual judgments, not proof of a location or independently adjudicated safety labels. Readable text and plate values are never transcribed or retained in labels/model output.

Coverage: 65 unique images inferred once per run, 0 unavailable; reused observations across repeated/overlapping frames are explicit, not independent API trials. Each replay has isolated history. Synthetic variants and repeated frames are correlated; natural holdout and natural sequences overlap within3 source clips, so their metrics are NOT independent replication. Only one positive natural sequence and two positive natural action frames: estimates are very uncertain. These clips were not used to tune prompts, score, thresholds or calibration; known original demo clip8275531 is excluded. Public training-data contamination is unknown. Once inspected, this set is a regression benchmark, not a perpetual unseen holdout. No threshold change recommended from this tiny set.

Reproduce: npm run eval -- --temporal (real calls; source videos required), npm run eval -- --validate (offline manifests), scripts/freeze-eval.ts documents the pre-inference freeze process and refuses overwrite. Default npm run eval also runs the temporal section. Original clips and author/license credits are in README. Design reference: [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices).


## QR Guard local detection — 2026-11-02T01:21:28.935Z

Detection-only ZXing geometry; payload reader/decoder never invoked. Standard QR only, no other2D formats claimed. Binary confidence1 is a structural match, not a calibrated probability. No model involved; source frames stay in RAM.

36 synthetic positives:18 size/rotation cases (36–240px at1280px frame width,0/+20/−35degrees) and12 successive moving-position/rotation samples at120px, plus6 extracted frames from a moving QR in an encoded6s video at240px. Position samples test geometry across a trajectory, not blur or real capture throughput.24 labelled-negative frames from the4 existing Pexels sources (6 per source, no obvious QR on visual review). Tiny or unknown hidden codes cannot be ruled out; this is a small regression check, not a complete natural false-positive study. Source/timestamps and case results stay in ignored data/takes/qr-guard/accuracy.json.

| Group | n | TP | FP | FN | TN | Unavailable |
|---|---:|---:|---:|---:|---:|---:|
| Synthetic QR | 36 | 32 | 0 | 4 | 0 | 0 |
| IRL no-obvious-QR | 24 | 0 | 0 | 0 | 24 | 0 |

| QR size px | Hits / cases | Unavailable |
|---|---:|---:|
| 36 | 1/3 | 0 |
| 48 | 1/3 | 0 |
| 64 | 3/3 | 0 |
| 96 | 3/3 | 0 |
| 120 | 12/12 | 0 |
| 160 | 3/3 | 0 |
| 240 | 9/9 | 0 |

Detector-only timing (image PNG processing included, OBS capture excluded): median33.72ms,p9561.52ms,n60. No blanket prevention claim; small-code misses and capture/motion/oblique-view coverage remain material limits. Real OBS pipeline latency and Twitch player evidence are recorded separately below.


### QR detector development comparison

Geometry-only initial pass:26/30 synthetic hits and2/24 IRL detections (both forest frames). Added a failing regression for three finder-like squares without QR timing structure before validating ONLY fixed finder/timing cells, never payload cells. A strict fixed-pattern check initially lost one64px/−35° case; its regression failed, then a more tolerant finder match restored it. Final original30-case comparison:26/30 hits and0/24 false positives. The6 encoded moving-video samples all detected, giving32/36 positives overall. These SAME cases informed detector tuning: this is development/regression evidence, not an independent held-out improvement claim. Four misses remain in36/48px rotated codes. No Off the Map score/threshold changed.

### Real OBS QR latency (controlled synthetic input)

20 actual protections on OBS33.0.0,1280px PNG,150ms loop,Main Render Delay500ms and Privacy Cut. Real source→local detector→pure policy→OBS command/readback, no model. The silent6s generated clip displays a240px TEST-ONLY QR between2–3s each loop. Consecutive clean recovery allowed the next cycle; final cleanup used Dismiss/restored prior media/scene. No Twitch output was started; markers excluded from this offline benchmark.

| Path | n | Median ms | p95 ms |
|---|---:|---:|---:|
| Detection complete → Privacy program confirmation | 20 | 6.45 | 8.03 |
| Capture start → Privacy program confirmation | 20 | 82.46 | 91.28 |

The150ms phase until the next capture is outside these timings. Adding nominal sampling phase150ms + capture-path p9591.28ms + one33.33ms video frame gives an illustrative budget of274.61ms against500ms. This sum is NOT a measured combined p95 or hard bound; scheduler/capture load can vary. The measured color-probe lead was407–476ms with up to42ms polling uncertainty. Program confirmation is not pixel-level or Twitch-player proof. No claim that the QR stayed off-air is made until the live player test. Numeric evidence remains ignored in data/takes/qr-guard/latency-150ms.json.

### First Twitch QR trial: inconclusive (2026-11-01)

Real Twitch was live and QR stream markers were created (sanitized receipts retained under ignored data/takes/qr-guard/). The secondary OBS browser was black; stock single-window ScreenCaptureKit successfully recorded the private dashboard plus actual Twitch player at1920×1080/60fps. Chrome's player video was1280×720, unpaused/readyState4 with advancing currentTime.

However, OBS Main became fully transparent with Render Delay enabled while OBS still reported Main selected; the Twitch player retained the Privacy picture. Disabling the filter offline restored the known synthetic blue video. Recreating the filter, trying a nested scene and a direct-source delay did not recover this graphics state. Restarting the stopped primary OBS did recover opaque delayed video and an actual clean-recovery cycle (transparency during the initial buffer warm-up is expected). Root cause is not established; do not attribute it conclusively to a particular transition or filter-reset call.

Every recorded frame of three early movie windows was inspected locally with the geometry detector, without decoding or extracting image files: initial manual control3429frames/0detections; protected window2903frames/0detections; final short manual control2435frames/0detections, all0detector-unavailable. Because the positive control also failed, these zero counts **cannot demonstrate that QR Guard prevented exposure**. Additional diagnostic movies, contact sheet and closed numeric receipts stay private under data/. No “QR never reached the air” claim is supported by this trial.

A failing regression now covers OBS reporting Main with a completely transparent output: readiness must reject it. The adapter periodically checks active Main alpha pixels in RAM, after expected buffer warm-up, and reports QR unavailable on an empty output; it never returns or stores the image. It does not assert that opaque pixels prove a current or correctly delayed feed. No score, policy threshold or calibration changed. Repeat moving-code timing and a successful visible benign Dismiss control are still required before final viewer-level conclusions.

Post-restart offline repeat with the encoded moving QR,20trials at150ms/1280px/500ms buffer: detection→scene median7.40ms,p959.38ms; capture→scene median71.99ms,p9582.42ms. Marker HTTP is excluded. The new active-Main output preflight was enabled in this run, which completed20 protections and automatic recoveries. Numeric evidence: ignored data/takes/qr-guard/latency-150ms-moving.json. This is again an OBS/RPC benchmark, not a Twitch pixel result.

### Continuous-buffer repeat (current QR layout)

Because repeated buffer resets eventually produced empty output again, the stopped-OBS layout now keeps Main rendering below a separately opaque stock color in Privacy. No reset occurs on recovery. Ordering, transforms, enabled state, normal blending, opaque source/no backstop filters and no scene cycle are checked. Core tests require M clean observations AND actual clean elapsed time≥configured delay for automatic recovery; defaultM14/~2.1s is unchanged. Dismiss is an explicit override.

Twenty actual moving-code protections/recoveries completed: detection→scene median10.47ms,p9512.87ms; capture→scene median70.82ms,p9592.93ms (150ms/1280px/500ms expected delay).12/12 subsequent numeric opacity samples spanning Main and Privacy were fully opaque. Latest numeric report is latency-150ms-moving.json; pre-layout report was retained separately. These still do not establish viewer pixels or a hard latency bound. Additional rendering and continued Main media/audio activity during Privacy are tradeoffs; silent inputs were used, not a camera-audio validation.

### User-supplied QR video screening (local only)

Two user-provided4K videos were scanned locally at5fps, at1280px and1920px widths. Source files remain ignored in `qr videos/`; only numeric timing/detection/box reports are saved under ignored data/takes/qr-guard/. No frames written, no payload decoding, no AI. These are detection counts, **not recall/precision**: per-frame labels have not been fixed. Higher resolution helps some frames and misses others; do not infer absence from a miss. Neither input was broadcast as a test code because its payload is unknown; the public proof uses known generated TEST-ONLY input.

| Clip | SHA-256 | Samples | Detected1280 | Detected1920 | Detector median/p951280 | Detector median/p951920 |
|---|---|---:|---:|---:|---:|---:|
|17363866 (10.30s)|2df8b2627ece3daa9428443f7cdac159c0016792ef2759c278f90e7dadda2753|52|4|9|60.02/72.56ms|133.98/151.32ms|
|15329614 (7.58s)|301bb3fe86364abee84544bc3567df590860e3d1b4f635bfc33fe92a8ba741de|38|9|13|62.05/76.63ms|137.20/155.59ms|

All four runs had0unavailable. First detected boxes were approximately65×61px and73×71px at1280; these are small targets.1920px detection cost more than doubles and excludes screenshot cost, so its current coverage gain is insufficient evidence to change the default fast-loop width/interval. At1280, detections include2.0/8.4/9.0/9.2s in the first clip and0.0/0.2/4.0/5.0/5.6/6.0/6.2/6.4/6.6s in the second (nominal sample times). Source provenance/license was not independently verified; no distribution of these files is made.


### Second Twitch QR trial — 2026-11-02, still inconclusive

Only the primary OBS streamed the known silent TEST-ONLY motion clip. The secondary recorded locally under a fresh blank LOCAL RECORDING ONLY profile, with all its audio inputs muted; it never streamed. Real Twitch live status and automatic marker receipts were observed (including stream positions 80–110 s in the protected monitor and 212–272 s in the later monitor). Marker receipts confirm integration, not visibility or prevention.

| Local recording of actual dashboard + Twitch player | Decoded frames | Geometric QR detections | Unavailable / blank player frames | Fixture-blue Main-like frames |
|---|---:|---:|---:|---:|
| Protected, qr-proof-live-protected-20261102.mov | 5,443 | 0 | 0 / 0 | 2,593 |
| Dismiss control + rearmed, qr-proof-live-control-rearmed-20261102.mov | 6,159 | 0 | 0 / 0 | 672 |

Analysis used every decoded frame and actual ffprobe presentation timestamps, cropping the player in RAM. Main-like is a fixture-specific blue pixel sanity check, not a QR or freshness classifier. No QR payload decoder was used. Zero detections in the positive control invalidate a prevention claim; these movies are diagnostic evidence only. Reviewing the archived Twitch VOD near the marker/control interval likewise did not establish a visibly successful QR control. No end-to-end viewer exposure window can honestly be measured from this trial.

A subsequent offline check, with QR automation disconnected, temporarily played the same clip in Main and compared undelayed-child/Main captures at 1280 px: 66 paired samples over approximately 12.5 s, 10 QR-positive samples in each path. It restored the original media afterwards. This establishes that the local scene can render the code when sampled, not that the streamed control did so. An additional exploratory Dismiss run is not counted as validation because it could start from retained guard state. The cause of the failed Twitch control remains unresolved; no graphics, player or timing explanation is asserted as proven.

An independently generated 6 s composition validated the recording analyzer: 360 decoded frames, 62 detections from 2.000–3.017 s, no blank frames. This checks analysis plumbing only and is not Twitch evidence. Runtime latency aggregates mix offline/live cycles, so the published n=20 controlled OBS benchmark remains the latency comparison; it must not be relabelled a live-player result.

The user stopped the primary stream. Both OBS instances were verified not streaming/not recording; the original primary clip and secondary profile/mutes/video settings were restored, temporary evidence sources removed, and normal npm run dev restarted without the process-only empty AI-key override. Data, movies and numeric receipts remain ignored under data/takes/qr-guard/. A further live proof requires a verified visible positive control first; “the QR never reaches the air” remains unsupported.


### Transition-lock reproduction and repaired encoded-output check — 2026-11-02

Consulted official OBS [confirmed issue11914](https://github.com/obsproject/obs-studio/issues/11914), [open repair PR14093](https://github.com/obsproject/obs-studio/pull/14093), and [obs-websocket source screenshot implementation](https://github.com/obsproject/obs-websocket/blob/master/src/requesthandler/RequestHandler_Sources.cpp). Source screenshots actively render the source; they are not encoded-program samples. The hypothesis was tested on local encoded output, independently of Twitch/Chrome.

The original18 s offline unprotected recording was stuck in Privacy:0 QR/538 frames. Automation was disconnected. We then recovered the transition graph through a Studio Mode round-trip while outputs were stopped, preserved Studio Mode/preview, selected global Cut and cleared Main/Privacy overrides. The collection default is now Cut; no third-party patch/plugin or score change.

| Direct encoded program, same TEST-ONLY motion input | Frames | QR-positive frames | Blank frames |
|---|---:|---:|---:|
| Before recovery, unprotected |538|0|0|
| After recovery, unprotected |538|93|1|
| After recovery, QR Guard active |539|0|1|
| After recovery, one manual Dismiss then rearmed |539|31|1|

All frames analyzed locally at640×360, actual encoded30fps/PTS from ffprobe, geometry only. Control positives2.500–3.500 s,8.500–9.500 s,14.500–15.500 s. Dismiss positives2.567–3.567 s, then subsequent QR cycles protected. Protected runtime:20 positive sensor observations,3 actual protection actions,0 capture failures. These are repeated frames from three appearances, not93 independent QR examples. Blank startup frames are explicitly counted, not interpreted as protection. No capture/model frames retained; requested private output recordings/derived TEST-ONLY review images remain in ignored data/.

The new encoded acceptance option --expect-qr fails the old stuck recording; the recovered control and Dismiss supply positive controls. --expect-no-qr checks the protected take. This establishes finite local program-output behavior; a new actual Twitch player control remains required. The workaround and before/after evidence support the transition-lock diagnosis, without claiming every earlier transparent-image symptom has that same cause.

After the transition repair, another20 real OBS moving-code actions at1280px/150ms measured detection-complete→confirmedPrivacy median10.45ms,p9511.38ms; capture-start→confirmedPrivacy median70.03ms,p9574.79ms. The nominal150ms phase +74.79ms path p95 +33.33ms video period is258.12ms versus500ms buffer: illustrative only, not a combined percentile/hard bound. Markers excluded offline. Prior benchmark retained separately under data/ before refreshing the current numeric report. Pixel-level program recordings above complement, rather than redefine, RPC latency. No pre-air Twitch claim yet.

### Repaired Twitch recording: complete frame analysis

`qr:analyze-take` inspected all **13,110 recorded frames at 60 fps** of the private dashboard/player movie. The geometric detector found **62 frames**, all between **59.967 and 60.983 seconds**, during the intentional Dismiss control; outside that interval it found none. No blank or unavailable player frames were reported. Frames may be duplicated and are not independent observations; detector misses and visibility between sensor samples remain possible. The recorded player has delivery delay and the test uses a known synthetic code, so this is evidence for the observed test, not a universal guarantee or a precise exposure bound. The movie and timestamps stay in ignored `data/`.

## Pre-stream model comparison — 2026-11-02

Compared the configured `openai/gpt-4.1-mini` with [OpenRouter's `openai/gpt-6.1-terra`](https://openrouter.ai/openai/gpt-6.1-terra) on exactly the same inputs, 1280 px, high detail, strict pre-stream schema and confidence ≥0.8. Inputs: three repetitions of the same synthetic uniform image, three authored synthetic clean frames (01, 05, 10), and six previously frozen, author-labelled Pexels frames: `n-3647789-{00,08,16}` and `n-37063950-{00,02,04}`. Existing source and encoded-frame hashes were verified before inference. Original pixels were held in memory; only generic numeric/label observations were saved under ignored `data/takes/final/`.

| Model | Uniform false positives | Clean-frame false positives | Natural matching labelled clues | Natural frames with matching clue | Unavailable natural frames |
|---|---:|---:|---:|---:|---:|
| GPT-4.1 mini | 3/3 | 3/3 | 4/6 available labels | 3/4 available | 2/6 invalid observation |
| GPT-6.1 Terra | 0/3 | 0/3 | 7/8 | 6/6 | 0/6 |

For each natural frame where mini produced valid observations, Terra detected every labelled category mini detected; Terra also detected landmarks in the other frames. Thus Terra met the earlier pre-stream-only criterion on this sample. After the broader comparison below, the user explicitly chose Terra for `PRESTREAM_MODEL` only, based on this task-specific result. Off the Map retains `OPENAI_MODEL`. `PRESTREAM_MODEL` is optional and defaults to the existing model on other installations. Model confidence is self-reported, not a calibrated probability.

These are single runs, three repeated identical uniform inputs and correlated frames from only two videos; clean and natural labels are author judgments, not independent adjudication. Two mini outputs were unavailable and excluded rather than counted as misses. This small comparison is not a general false-positive/recall estimate or a guarantee; provider routing and model output can vary. The Pexels sources and freeze manifest are documented in the temporal evaluation above.

## Full Spotter model comparison — 2026-11-02

Ran `OPENAI_MODEL=openai/gpt-6.1-terra npm run eval` once with unchanged prompts, configured AI timeout, 1280 px/high detail, labels, histories and thresholds. The synthetic dataset hash was `ec3710e8f14bb2737d2772c9ef049c473c046e00a505a6a7bded3a91acd9d79c` and temporal freeze-manifest hash `3d0652debd2c6690aa6db3f8bb0dc2b7843f66cbd3eb564c466c32ad6e72aea5`, matching the published mini baseline. Original baseline and per-case outputs are preserved privately under ignored `data/eval/terra-comparison/`; model frames remain in memory.

| Test | Model | TP | FP | FN | TN | Unavailable | Precision | Recall |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| All sequences ≥80 (12) | GPT-4.1 mini | 4 | 0 | 2 | 6 | 0 | 100% | 66.7% |
| All sequences ≥80 (12) | GPT-6.1 Terra | 6 | 0 | 0 | 5 | 1 | 100% | 100% |
| Synthetic sequences ≥80 (9) | GPT-4.1 mini | 3 | 0 | 2 | 4 | 0 | 100% | 60% |
| Synthetic sequences ≥80 (9) | GPT-6.1 Terra | 5 | 0 | 0 | 4 | 0 | 100% | 100% |
| Natural sequences ≥80 (3) | GPT-4.1 mini | 1 | 0 | 0 | 2 | 0 | 100% | 100% |
| Natural sequences ≥80 (3) | GPT-6.1 Terra | 1 | 0 | 0 | 1 | 1 | 100% | 100% |
| Synthetic frames ≥80 (30) | GPT-4.1 mini | 6 | 1 | 4 | 19 | 0 | 85.7% | 60% |
| Synthetic frames ≥80 (30) | GPT-6.1 Terra | 7 | 1 | 1 | 19 | 2 | 87.5% | 87.5% |
| Natural frames ≥80 (18) | GPT-4.1 mini | 0 | 0 | 2 | 16 | 0 | undefined | 0% |
| Natural frames ≥80 (18) | GPT-6.1 Terra | 0 | 0 | 2 | 15 | 1 | undefined | 0% |
| Chat classifier (40) | GPT-4.1 mini | 20 | 0 | 0 | 20 | 0 | 100% | 100% |
| Chat classifier (40) | GPT-6.1 Terra | 17 | 0 | 3 | 20 | 0 | 100% | 85% |
| Chat moderation confidence ≥0.8 (40) | GPT-4.1 mini | 20 | 0 | 0 | 20 | 0 | 100% | 100% |
| Chat moderation confidence ≥0.8 (40) | GPT-6.1 Terra | 17 | 0 | 3 | 20 | 0 | 100% | 85% |

Unavailable observations are excluded from precision and recall rather than treated as safe: Terra had 2/30 unavailable synthetic standalone frames, 6/65 unavailable unique temporal frames and one unavailable sequence, against zero in the mini baseline. Thus Terra does **not** meet the no-increase-in-unavailable criterion, even though its precision and recall on the available sequences meet the requested values. Chat recall is also lower. GPT-4.1 mini remains the configured model for Off the Map and Chat Guard. The user subsequently chose Terra for the separate pre-stream check based on its task-specific comparison (0/6 false positives and 0 unavailable versus mini 6/6 false positives); these small samples do not negate the broader results. The earlier small pre-stream experiment is retained above as historical evidence; it is not a substitute for this full comparison.

Controlled offline OBS benchmark, same generated frame-21 input, configured timeout and 10 trials, excludes marker completion and viewer/network delay:

| Measurement | GPT-4.1 mini baseline | GPT-6.1 Terra |
|---|---:|---:|
| Decided Privacy action → confirmed OBS scene | median 12.04 ms (derived from 8 single-sample trials only) | median 13.28 ms, p95 19.03 ms, n=10 |
| Capture start → confirmed OBS scene | median 2.149 s, p95 2.616 s, n=10 | median 4.006 s, p95 4.909 s, n=10 |
| Vision call, median of per-trial medians | 2.108 s, n=10 | 4.107 s, p95 4.880 s, n=10 |
| Unavailable analysis attempts | 0 | 3 |

The action clock starts immediately before the decided Privacy RPC and ends after scene readback; it is below 3.5 s for Terra. The 4.006 s full-path median is a different, practically relevant measurement, not the decision-to-scene value. Vision medians include per-trial medians when more than one sample was needed, so they cannot be subtracted from full-path medians as paired values. The old baseline did not directly measure action time; its value is derived only for eight single-sample trials. Ten trials and a single synthetic input do not establish population latency or viewer exposure. The benchmark never starts/stops outputs, excludes markers, and restores the source/scene; results may vary with routing and load.

The datasets are small, labelled by the author, contain correlated repeated frames and are no longer unseen holdouts. Precision/recall are undefined where no positive predictions exist. No threshold, label, timeout or score was changed to improve the result.

## Final live session — 2026-11-02

This session was an integration observation, not a new labelled accuracy evaluation. With a recorded IRL clip and real vision, the score reached 82; OBS entered Privacy, Twitch accepted a marker, and Dismiss restored Main. Simulated audio reached energy 44 and the combined alert appeared with real chat connected. A fictional chat guess was flagged rather than deleted; a temporary harmless blocked term was removed after Twitch held the test message. The outbound raid was confirmed on the sending instance, while the receiving instance remained in its previous `home` state; receiver overlay and tag back were not verified. QR Guard was armed but the final session did not present the synthetic QR, so no QR take exists to analyze and this session adds no new prevention result. Earlier finite QR evidence above is unchanged. Local evidence is ignored under `data/takes/final/`; both outputs stopped and final pre-stream check returned GREEN.

## Follow-up QR live take — 2026-11-02

With a known TEST-ONLY looping QR, QR Guard triggered Privacy and Twitch accepted markers. An intentionally dismissed control was followed by automatic rearming; both were captured in a silent private recording of the actual Twitch player. Local geometry-only analysis of the 1920×1080 recording, cropping the player to 640×360 and checking all **16,546** encoded frames at 60 fps, returned **0 detections**, including the intended visible Dismiss control, with zero detector errors and 67 blank frames across the entire recording (including startup). The recording includes a pre-live startup period. Because the positive control was not detected, this take is **inconclusive for viewer-side prevention**; a missed detection or control timing failure cannot be ruled out. It does not replace the earlier take with its successful visible control and does not prove a guarantee. The in-memory detector was independently exercised offline on the source: 11 positive observations in 58 captures, zero capture errors. Aggregate latency reported after the session was n=64, capture→scene median 73.63 ms / p95 100.27 ms, detection→scene median 10.91 ms / p95 14.07 ms; these counts include offline preparation and are not a live-only measurement. Recorded evidence and numeric reports remain ignored under `data/takes/final/`; no QR payload was decoded and no detector frame saved.
