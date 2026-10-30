import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ResponsesAI, parseVisionDetail } from '../src/ai/responses.ts';
import { parseAiTimeoutMs } from '../src/config.ts';
import { scoreFindability } from '../src/core/exposure.ts';
import { confusion } from '../src/observability/metrics.ts';
import { clueCategories } from '../src/core/types.ts';
if (process.argv.includes('--temporal')) { await import('./evaluate-temporal.ts'); process.exit(0); }
const root = 'test/fixtures/eval';
const frames = JSON.parse(await readFile(`${root}/frames.json`, 'utf8')) as { id: string; file: string; categories: string[]; warn: boolean; act: boolean }[];
const chat = JSON.parse(await readFile(`${root}/chat.json`, 'utf8')) as { id: string; text: string; guessing: boolean }[];
const hash = createHash('sha256');
for (const path of ['frames.json', 'chat.json', ...frames.map(row => row.file)]) hash.update(await readFile(`${root}/${path}`));
const datasetHash = hash.digest('hex');
if (frames.length !== 30 || chat.length !== 40 || new Set([...frames, ...chat].map(row => row.id)).size !== 70) throw Error('Invalid frozen dataset');
if (process.argv.includes('--validate')) { console.log(JSON.stringify({ frames: frames.length, chat: chat.length, datasetHash })); await import('./evaluate-temporal.ts'); process.exit(0); }
const model = process.env.OPENAI_MODEL ?? '';
if (!model || !process.env.OPENAI_API_KEY) throw Error('Configure OPENAI_MODEL and OPENAI_API_KEY before real evaluation');
const ai = new ResponsesAI({ key: process.env.OPENAI_API_KEY ?? '', model, baseURL: process.env.AI_BASE_URL ?? '', detail: parseVisionDetail(process.env.OPENAI_VISION_DETAIL), timeoutMs: parseAiTimeoutMs(process.env.AI_TIMEOUT_MS) });
const imageRows: { id: string; score: number | null; categories: string[] | null }[] = [];
const chatRows: { id: string; guessing: boolean | null; confidence: number | null }[] = [];
for (const frame of frames) {
  try {
    const image = await readFile(`${root}/${frame.file}`);
    const clues = await ai.vision(`data:image/png;base64,${image.toString('base64')}`);
    imageRows.push({ id: frame.id, score: scoreFindability(clues, [], 0), categories: clues.map(clue => clue.category) });
  } catch { imageRows.push({ id: frame.id, score: null, categories: null }); }
  console.log(`${frame.id}: ${imageRows.at(-1)!.score ?? 'unavailable'}`);
}
for (const row of chat) {
  try { const result = await ai.classifyChat(row.text); chatRows.push({ id: row.id, ...result }); }
  catch { chatRows.push({ id: row.id, guessing: null, confidence: null }); }
  console.log(`${row.id}: ${chatRows.at(-1)!.guessing ?? 'unavailable'}`);
}
const thresholdMetric = (key: 'warn' | 'act', threshold: number) => confusion(frames.map((gold, i) => ({ expected: gold[key], predicted: imageRows[i]!.score === null ? null : imageRows[i]!.score! >= threshold })));
const metrics = {
  exposure60: thresholdMetric('warn', 60), exposure80: thresholdMetric('act', 80),
  clueCategoriesMicro: confusion(frames.flatMap((gold, i) => clueCategories.map(category => ({ expected: gold.categories.includes(category), predicted: imageRows[i]!.categories === null ? null : imageRows[i]!.categories!.includes(category) })))),
  chatClassifier: confusion(chat.map((gold, i) => ({ expected: gold.guessing, predicted: chatRows[i]!.guessing }))),
  chatModeration80: confusion(chat.map((gold, i) => ({ expected: gold.guessing, predicted: chatRows[i]!.guessing === null ? null : chatRows[i]!.guessing! && chatRows[i]!.confidence! >= .8 }))),
};
const result = { at: new Date().toISOString(), model, detail: parseVisionDetail(process.env.OPENAI_VISION_DETAIL), datasetHash, metrics, imageRows, chatRows };
await mkdir('data/eval', { recursive: true }); await writeFile('data/eval/latest.json', JSON.stringify(result, null, 2)+'\n', { mode: 0o600 });
const percentage = (value: number | null) => value === null ? 'undefined' : `${(value * 100).toFixed(1)}%`;
const table = Object.entries(metrics).map(([name, m]) => `| ${name} | ${m.n} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.tn} | ${m.unavailable} | ${percentage(m.precision)} | ${percentage(m.recall)} |`).join('\n');
const text = `# Small authored evaluation — ${result.at}\n\nModel: \`${model}\`; detail ${result.detail}; 1280×720 authored PNGs. Dataset SHA-256: \`${datasetHash}\`.\n\n30 original procedural scenes and 40 original EN/ES chat messages, CC0; labels fixed before inference. Fictional identifiers only, no real places. Source: test/fixtures/eval/; renderer: scripts/generate-eval.py (Pillow, only needed to regenerate assets). npm run eval uses the existing configured real API and costs money; npm run eval -- --validate checks the frozen dataset offline. Per-case results stay in ignored data/eval/.\n\n| Task | n | TP | FP | FN | TN | unavailable | Precision | Recall |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\nRows are actual positive/negative and columns predicted positive/negative: [[TP,FN],[FP,TN]]. Unavailable cases are excluded from precision/recall and reported separately, never classified as safe. Undefined denominators are shown explicitly. Category micro metrics cover 30×10 binary category targets.\n\nGold warning: two independent readable fictional identifiers; gold action: multiple independent identifiers; negative: generic scenery/signage. Exposure metrics apply the unchanged score independently to each frame with empty history at 60/80. This diagnostic is NOT an evaluation of temporal accumulation or real-world safety. Chat classifier uses guessing; chatModeration80 additionally uses the existing confidence ≥0.8 eligibility policy (flag by default, delete only with explicit opt-in).\n\nLimitations: small, balanced synthetic development set, author-labelled without independent adjudication, multiple variants of the same procedural scene; this original standalone section has no natural holdout, and the appended extension reports natural data separately. Model nondeterminism and provider routing can change reruns. Precision depends on prevalence. No threshold is changed by this command; missed clues require a licensed natural-clip holdout and label review before recommending a threshold. No safety guarantee.\n`;
await writeFile('docs/EVAL.md', text);
console.log(JSON.stringify(metrics));
if (!process.argv.includes('--synthetic-only')) await import('./evaluate-temporal.ts');
