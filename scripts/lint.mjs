import { readdir, readFile } from 'node:fs/promises';

async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(`${path}/${entry.name}`) : `${path}/${entry.name}`))).flat();
}
const paths = (await Promise.all(['src', 'dashboard', 'overlay', 'privacy', 'sensor', 'test', 'scripts', 'shared'].map(files))).flat();
const errors = [];
for (const path of paths.filter((path) => /\.(ts|mjs|html)$/.test(path))) {
  const source = await readFile(path, 'utf8');
  if (/\t| +$/m.test(source)) errors.push(`${path}: tab or trailing whitespace`);
  if (/\beval\s*\(/.test(source)) errors.push(`${path}: eval is forbidden`);
  if (/^src\/core\//.test(path) && /\b(fetch|process|Date\.now|Math\.random)\b|from ['"](?:node:|fastify|obs-websocket-js)/.test(source)) errors.push(`${path}: core must be pure`);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Lint passed (${paths.length} files; whitespace, eval and core purity rules).`);
