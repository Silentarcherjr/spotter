import { detectQr } from './detector.ts';
import type { QrObservation } from './detector.ts';
interface Dependencies {
  capture: () => Promise<Buffer>;
  observe: (
    value: QrObservation,
    timing: { captureMs: number; detectorMs: number; started: number },
  ) => Promise<void>;
  unavailable: () => void;
}
/** Dedicated local-only loop. Captures are never retained or forwarded to AI. */
export class QrSensor {
  private dependencies: Dependencies;
  private interval: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;
  private revision = 0;
  constructor(dependencies: Dependencies, interval = 150) {
    if (!Number.isInteger(interval) || interval < 100 || interval > 200)
      throw Error('QR interval must be100–200ms');
    this.dependencies = dependencies;
    this.interval = interval;
  }
  start() {
    if (this.timer) return;
    void this.sample();
    this.timer = setInterval(() => {
      void this.sample();
    }, this.interval);
    this.timer.unref();
  }
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.revision++;
  }
  async sample() {
    if (this.busy) return;
    this.busy = true;
    const revision = this.revision;
    const started = performance.now();
    try {
      const image = await this.dependencies.capture();
      const captured = performance.now();
      const value = detectQr(image);
      const detected = performance.now();
      if (revision !== this.revision) return;
      await this.dependencies.observe(value, {
        captureMs: captured - started,
        detectorMs: detected - captured,
        started,
      });
    } catch {
      if (revision === this.revision) this.dependencies.unavailable();
    } finally {
      this.busy = false;
    }
  }
}
