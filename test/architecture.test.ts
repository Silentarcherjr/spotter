import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

async function sources(path: string): Promise<string[]> {
  return (await Promise.all((await readdir(path, { withFileTypes: true })).map((entry) => entry.isDirectory() ? sources(`${path}/${entry.name}`) : `${path}/${entry.name}`))).flat();
}

test('service endpoints and OBS imports remain inside their authorized adapters; core imports stay pure', async () => {
  for (const path of (await sources('src')).filter((path) => path.endsWith('.ts'))) {
    const source = await readFile(path, 'utf8');
    if (/https:\/\/(api|id)\.twitch\.tv/.test(source)) assert.ok(path.startsWith('src/twitch/'), path);
    if (/https:\/\/(?:api\.openai\.com|openrouter\.ai)/.test(source)) assert.ok(path.startsWith('src/ai/'), path);
    if (/from ['"]obs-websocket-js/.test(source)) assert.ok(path.startsWith('src/obs/'), path);
    if (path.startsWith('src/core/')) {
      for (const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) assert.ok(match[1]?.startsWith('./'), `${path}: core imports an I/O layer`);
      assert.doesNotMatch(source, /\b(fetch|process|Date\.now|Math\.random)\b/, path);
    }
  }
});
