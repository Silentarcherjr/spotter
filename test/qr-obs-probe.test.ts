import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { firstPixel, probeRenderDelay, summarizeLead } from '../src/obs/qr-probe.ts';
import type { SetupWire } from '../src/obs/setup.ts';
function png(rgb: number[]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  const chunk = (type: string, body: Buffer) => {
    const b = Buffer.alloc(body.length + 12);
    b.writeUInt32BE(body.length);
    b.write(type, 4);
    body.copy(b, 8);
    return b;
  };
  return (
    'data:image/png;base64,' +
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(Buffer.from([0, ...rgb]))),
      chunk('IEND', Buffer.alloc(0)),
    ]).toString('base64')
  );
}
test('OBS probe inspects only the synthetic PNG color, never saves screenshot bytes', () => {
  assert.deepEqual(firstPixel(png([255, 0, 0])), [255, 0, 0]);
  assert.throws(() => firstPixel('invalid'));
});
test('render-delay probe refuses active outputs and never mutates scenes while live', async () => {
  for (const active of ['GetStreamStatus', 'GetRecordStatus']) {
    const calls: string[] = [];
    const wire = {
      async connect() {},
      async disconnect() {},
      async call(name: string) {
        calls.push(name);
        return { outputActive: name === active };
      },
    } as unknown as SetupWire;
    await assert.rejects(probeRenderDelay({ url: 'ws://localhost:4455', password: '' }, wire));
    assert.ok(!calls.some((name) => /Create|Set|Remove/.test(name)));
  }
});

test('probe reports negative or absent lead honestly instead of clamping failed anticipation', () => {
  assert.deepEqual(summarizeLead([-20, 0, 20]), { n: 3, medianMs: 0, p95Ms: 20 });
  assert.deepEqual(summarizeLead([]), { n: 0, medianMs: null, p95Ms: null });
});
