import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ResponsesAI, parseVisionDetail } from '../src/ai/responses.ts';
import { parseAiTimeoutMs } from '../src/config.ts';
import { evalFrame } from '../src/media/eval-frame.ts';
import { replaySequence } from '../src/evaluation/sequences.ts';
import { scoreFindability } from '../src/core/exposure.ts';
import { confusion } from '../src/observability/metrics.ts';
import type { Clue } from '../src/core/types.ts';
const root = 'test/fixtures/eval-temporal';
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
type Frame = { id: string; clip: string; seconds: number; warn: boolean; act: boolean };
type Sequence = {
  id: string;
  domain: 'synthetic' | 'natural';
  act: boolean;
  frames: { id: string; at: number }[];
};
const labels = JSON.parse(await readFile(`${root}/labels.json`, 'utf8')) as {
  clips: { id: string }[];
  naturalFrames: Frame[];
  holdout: string[];
  sequences: Sequence[];
};
const frozen = JSON.parse(await readFile(`${root}/freeze.json`, 'utf8')) as {
  frozenAt: string;
  labelsSha256: string;
  frames: Record<string, string>;
  clips: Record<string, string>;
};
const datasetHash = digest(await readFile(`${root}/freeze.json`));
if (
  digest(await readFile(`${root}/labels.json`)) !== frozen.labelsSha256 ||
  labels.holdout.length !== 18 ||
  labels.sequences.length !== 12 ||
  labels.sequences.some((row) => row.frames.length < 8 || row.frames.length > 12)
)
  throw Error('Frozen labels changed');
if (process.argv.includes('--validate')) {
  console.log(
    JSON.stringify({
      temporalSequences: labels.sequences.length,
      naturalHoldout: labels.holdout.length,
      frozenAt: frozen.frozenAt,
      datasetHash,
    }),
  );
} else {
  // Verify all source bytes before calling the model; abort instead of silently evaluating a different dataset.
  for (const clip of labels.clips)
    if (digest(await readFile(`data/eval/natural/pexels-${clip.id}.mp4`)) !== frozen.clips[clip.id])
      throw Error('Natural clip hash mismatch');
  const model = process.env.OPENAI_MODEL ?? '';
  if (!model || !process.env.OPENAI_API_KEY) throw Error('Configure AI before real evaluation');
  const detail = parseVisionDetail(process.env.OPENAI_VISION_DETAIL);
  const ai = new ResponsesAI({
    key: process.env.OPENAI_API_KEY,
    model,
    detail,
    baseURL: process.env.AI_BASE_URL ?? '',
    timeoutMs: parseAiTimeoutMs(process.env.AI_TIMEOUT_MS),
  });
  const observations = new Map<string, Clue[] | null>();
  const frameIds = [
    ...new Set([
      ...labels.holdout,
      ...labels.sequences.flatMap((row) => row.frames.map((frame) => frame.id)),
    ]),
  ];
  let cursor = 0;
  async function worker() {
    while (cursor < frameIds.length) {
      const id = frameIds[cursor++]!;
      const natural = labels.naturalFrames.find((row) => row.id === id);
      const bytes = natural
        ? await evalFrame(`data/eval/natural/pexels-${natural.clip}.mp4`, natural.seconds)
        : await readFile(`test/fixtures/eval/${id}.png`);
      if (digest(bytes) !== frozen.frames[id])
        throw Error('Frame hash mismatch; no inference permitted');
      try {
        observations.set(
          id,
          await ai.vision(
            `data:image/${natural ? 'jpeg' : 'png'};base64,${bytes.toString('base64')}`,
          ),
        );
      } catch {
        observations.set(id, null);
      }
      console.log(`${id}: ${observations.get(id) === null ? 'unavailable' : 'analyzed'}`);
    }
  }
  await Promise.all([worker(), worker()]);
  const sequenceRows = labels.sequences.map((gold) => ({
    id: gold.id,
    domain: gold.domain,
    expected: gold.act,
    ...replaySequence(
      gold.frames.map((frame) => ({ at: frame.at, clues: observations.get(frame.id) ?? null })),
    ),
  }));
  const naturalRows = labels.holdout.map((id) => {
    const gold = labels.naturalFrames.find((row) => row.id === id)!;
    const clues = observations.get(id) ?? null;
    return {
      id,
      expected60: gold.warn,
      expected80: gold.act,
      score: clues === null ? null : scoreFindability(clues, [], 0),
    };
  });
  const sequenceMetric = (domain?: string) =>
    confusion(
      sequenceRows
        .filter((row) => !domain || row.domain === domain)
        .map((row) => ({ expected: row.expected, predicted: row.positive })),
    );
  const metrics = {
    sequencesAll80: sequenceMetric(),
    sequencesSynthetic80: sequenceMetric('synthetic'),
    sequencesNatural80: sequenceMetric('natural'),
    naturalFrames60: confusion(
      naturalRows.map((row) => ({
        expected: row.expected60,
        predicted: row.score === null ? null : row.score >= 60,
      })),
    ),
    naturalFrames80: confusion(
      naturalRows.map((row) => ({
        expected: row.expected80,
        predicted: row.score === null ? null : row.score >= 80,
      })),
    ),
  };
  const result = {
    at: new Date().toISOString(),
    model,
    detail,
    datasetHash,
    frozenAt: frozen.frozenAt,
    uniqueFrames: frameIds.length,
    unavailableFrames: [...observations.values()].filter((value) => value === null).length,
    metrics,
    sequenceRows,
    naturalRows,
    observations: Object.fromEntries(observations),
  };
  await mkdir('data/eval', { recursive: true });
  await writeFile('data/eval/temporal-latest.json', JSON.stringify(result, null, 2) + '\n', {
    mode: 0o600,
  });
  const pct = (value: number | null) =>
    value === null ? 'undefined' : `${(value * 100).toFixed(1)}%`;
  const table = Object.entries(metrics)
    .map(
      ([name, m]) =>
        `| ${name} | ${m.n} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.tn} | ${m.unavailable} | ${pct(m.precision)} | ${pct(m.recall)} |`,
    )
    .join('\n');
  const sequenceTable = sequenceRows
    .map(
      (row) =>
        `| ${row.id} | ${row.domain} | ${row.expected ? 'risk' : 'no obvious identifying combination'} | ${row.positive === null ? 'unavailable' : row.positive ? 'crossed 80' : 'no crossing'} | ${Math.max(...row.scores)} | ${row.firstCrossingMs === null ? '—' : `${row.firstCrossingMs / 1000}s`} |`,
    )
    .join('\n');
  const section = `\n\n## Temporal sequences and natural holdout — ${result.at}\n\nModel \`${model}\`, ${detail} detail, 1280 px, unchanged prompts, score and thresholds. Labels frozen at ${frozen.frozenAt}, before any inference on this natural dataset. Freeze-manifest SHA-256: \`${datasetHash}\`. Labels SHA-256: \`${frozen.labelsSha256}\`. Tracked manifests in test/fixtures/eval-temporal/ publish per-clip and per-encoded-frame hashes, generic labels, timestamps and sequence membership. Source videos stay ignored in data/eval/natural/; extracted natural frames are NEVER saved.\n\n12 sequences ×10 frames:9 synthetic development sequences at4s cadence and3 chronological natural sequences. Natural cadences: facade2s, trail4s, short street clip1s (sensitivity experiment, not the default4s production cadence). Each sequence starts with empty history, then calls the actual scoreFindability and decideExposure with the full120s history and existing30s decay. Tests compare replay to OffTheMap production runtime. This is offline observation replay: model latency, busy-sample skips and OBS/player delay are not simulated; selected input cadence is not a wall-clock throughput claim. Positive means at least one actual privacy decision at80 on available evidence; unavailable frames retain the prior score without taking an action. Without a crossing, any unavailable frame makes the sequence prediction unknown.\n\n| Task | n | TP | FP | FN | TN | unavailable | Precision | Recall |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\n| Sequence | Source | Pre-inference label | Result | Peak | First crossing |\n|---|---|---|---|---:|---:|\n${sequenceTable}\n\nNatural standalone holdout:18 frames (6 per newly downloaded source), evaluated with empty history separately from synthetic results. Gold warning means clearly readable identifying evidence; gold action means independent readable identifiers in at least two categories. Sequence labels instead judge the cumulative identifying combination over the whole sequence. The street sequence is positive from the initial storefront/plate evidence; the facade and forest sequences are negative. These are author visual judgments, not proof of a location or independently adjudicated safety labels. Readable text and plate values are never transcribed or retained in labels/model output.\n\nCoverage: ${frameIds.length} unique images inferred once per run, ${result.unavailableFrames} unavailable; reused observations across repeated/overlapping frames are explicit, not independent API trials. Each replay has isolated history. Synthetic variants and repeated frames are correlated; natural holdout and natural sequences overlap within3 source clips, so their metrics are NOT independent replication. Only one positive natural sequence and two positive natural action frames: estimates are very uncertain. These clips were not used to tune prompts, score, thresholds or calibration; known original demo clip8275531 is excluded. Public training-data contamination is unknown. Once inspected, this set is a regression benchmark, not a perpetual unseen holdout. No threshold change recommended from this tiny set.\n\nReproduce: npm run eval -- --temporal (real calls; source videos required), npm run eval -- --validate (offline manifests), scripts/freeze-eval.ts documents the pre-inference freeze process and refuses overwrite. Default npm run eval also runs the temporal section. Original clips and author/license credits are in README. Design reference: [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices).\n`;
  const existing = await readFile('docs/EVAL.md', 'utf8');
  await writeFile(
    'docs/EVAL.md',
    existing.split('\n\n## Temporal sequences and natural holdout')[0] + section,
  );
  console.log(
    JSON.stringify({ datasetHash, metrics, unavailableFrames: result.unavailableFrames }),
  );
}
