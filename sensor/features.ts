import { PitchDetector } from 'pitchy';
import type { AudioFeatures } from '../src/core/types.ts';

export class FeatureWindow {
  private detector: PitchDetector<Float32Array>;
  private sampleRate: number;
  private frames: { rms: number; pitch: number; slope: number; voiced: boolean }[] = [];
  private lastVoiced: number | null = null;
  private lastPeak = -1_000;
  private peaks = 0;
  private lastRms = 0;
  private now = 0;
  constructor(size: number, sampleRate: number) {
    this.detector = PitchDetector.forFloat32Array(size);
    this.sampleRate = sampleRate;
  }
  push(buffer: Float32Array, spectrum: Float32Array, now: number): void {
    this.now = now;
    this.lastVoiced ??= now;
    const rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
    const [pitch, clarity] = this.detector.findPitch(buffer, this.sampleRate);
    const voiced = rms > 0.01 && clarity >= 0.9 && pitch >= 70 && pitch <= 600;
    if (voiced) this.lastVoiced = now;
    if (rms > 0.02 && rms > this.lastRms * 1.35 && now - this.lastPeak > 180) {
      this.peaks++;
      this.lastPeak = now;
    }
    this.lastRms = rms;
    // Least-squares dB per octave, computed locally from the spectral bins.
    let count = 0;
    let x = 0;
    let y = 0;
    let xx = 0;
    let xy = 0;
    for (let index = 1; index < spectrum.length; index++) {
      const hz = (index * this.sampleRate) / (spectrum.length * 2);
      const db = spectrum[index]!;
      if (hz < 100 || hz > 4000 || !Number.isFinite(db)) continue;
      const log = Math.log2(hz);
      count++;
      x += log;
      y += db;
      xx += log * log;
      xy += log * db;
    }
    const denominator = count * xx - x * x;
    const slope = denominator ? (count * xy - x * y) / denominator : 0;
    this.frames.push({ rms, pitch: voiced ? pitch : 0, slope, voiced });
    if (this.frames.length > 100) this.frames.shift();
  }
  flush(at: number): AudioFeatures | null {
    const frames = this.frames;
    this.frames = [];
    const peaks = this.peaks;
    this.peaks = 0;
    if (frames.length < 10) return null;
    const pitches = frames
      .filter((frame) => frame.voiced)
      .map((frame) => frame.pitch)
      .toSorted((a, b) => a - b);
    const percentile = (ratio: number) => pitches[Math.floor((pitches.length - 1) * ratio)] ?? 0;
    return {
      at,
      rms: frames.reduce((sum, frame) => sum + frame.rms, 0) / frames.length,
      pitchMedian: percentile(0.5),
      pitchRange: percentile(0.9) - percentile(0.1),
      spectralSlope: frames.reduce((sum, frame) => sum + frame.slope, 0) / frames.length,
      voicedRatio: pitches.length / frames.length,
      pauseLength: Math.max(0, this.now - (this.lastVoiced ?? this.now)) / 1000,
      speechRate: peaks,
    };
  }
}
