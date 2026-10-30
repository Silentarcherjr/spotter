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

Gold warning: two independent readable fictional identifiers; gold action: multiple independent identifiers; negative: generic scenery/signage. Exposure metrics apply the unchanged score independently to each frame with empty history at 60/80. This diagnostic is NOT an evaluation of temporal accumulation or real-world safety. Chat classifier uses guessing; chatModeration80 additionally uses the existing confidence ≥0.8 policy.

Limitations: small, balanced synthetic development set, author-labelled without independent adjudication, multiple variants of the same procedural scene, no natural IRL holdout. Model nondeterminism and provider routing can change reruns. Precision depends on prevalence. No threshold is changed by this command; missed clues require a licensed natural-clip holdout and label review before recommending a threshold. No safety guarantee.
