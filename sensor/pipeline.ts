import { FeatureWindow } from './features.ts';
interface Analyser { fftSize: number; frequencyBinCount: number; getFloatTimeDomainData(buffer: Float32Array<ArrayBuffer>): void; getFloatFrequencyData(buffer: Float32Array<ArrayBuffer>): void }
/** The same sampler/extractor for both Web Audio source types. */
export class NumericAudioPipeline {
  private analyser: Analyser;
  private features: FeatureWindow;
  private time: Float32Array<ArrayBuffer>;
  private frequency: Float32Array<ArrayBuffer>;
  private lastWindow = 0;
  constructor(analyser: Analyser, sampleRate: number) { this.analyser = analyser; this.features = new FeatureWindow(analyser.fftSize, sampleRate); this.time = new Float32Array(analyser.fftSize); this.frequency = new Float32Array(analyser.frequencyBinCount); }
  sample(now: number, at: number) {
    this.analyser.getFloatTimeDomainData(this.time); this.analyser.getFloatFrequencyData(this.frequency);
    this.features.push(this.time, this.frequency, now);
    if (now - this.lastWindow < 1000) return null;
    this.lastWindow = now; return this.features.flush(at);
  }
}
