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
