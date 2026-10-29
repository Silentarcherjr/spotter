import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NumericAudioPipeline } from '../sensor/pipeline.ts';

test('microphone and file sources produce identical numeric packets through the shared analyser/extractor', () => {
  const make = () => ({ fftSize: 2048, frequencyBinCount: 1024,
    getFloatTimeDomainData(buffer: Float32Array) { for (let i = 0; i < buffer.length; i++) buffer[i] = .2 * Math.sin(2 * Math.PI * 150 * i / 48000); },
    getFloatFrequencyData(buffer: Float32Array) { buffer.fill(-60); },
  });
  const mic = new NumericAudioPipeline(make(), 48000); const file = new NumericAudioPipeline(make(), 48000);
  for (let now = 25; now <= 2000; now += 25) {
    const a = mic.sample(now, now); const b = file.sample(now, now);
    assert.deepEqual(a, b);
    if (a) { assert.ok(Math.abs(a.pitchMedian - 150) < 3); assert.ok(Object.values(a).every((v) => typeof v === 'number')); }
  }
});
