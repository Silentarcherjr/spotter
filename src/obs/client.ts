import OBSWebSocket from 'obs-websocket-js';

export type ObsWire = Pick<OBSWebSocket, 'connect' | 'disconnect' | 'call' | 'on'>;
export interface ObsConfig { url: string; password: string; privacyScene: string; source?: string; blurFilter?: string }
export class ObsClient {
  connected = false;
  private config: ObsConfig;
  private wire: ObsWire;
  private stopped = true;
  private connecting = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private previousScene: string | null = null;
  private previousFilter: boolean | null = null;
  constructor(config: ObsConfig, wire: ObsWire = new OBSWebSocket()) {
    this.config = config; this.wire = wire;
    wire.on('ConnectionClosed', () => { this.connected = false; this.schedule(); });
    wire.on('ConnectionError', () => { this.connected = false; this.schedule(); });
  }
  async start(): Promise<void> {
    this.stopped = false;
    if (this.connecting || this.connected) return;
    this.connecting = true;
    try { await this.limit(this.wire.connect(this.config.url, this.config.password)); this.connected = !this.stopped; }
    catch { this.connected = false; await this.wire.disconnect().catch(() => {}); this.schedule(); }
    finally { this.connecting = false; }
  }
  private schedule(): void {
    if (this.stopped || this.retry) return;
    this.retry = setTimeout(() => { this.retry = undefined; void this.start(); }, 3_000); this.retry.unref();
  }
  async stop(): Promise<void> { this.stopped = true; clearTimeout(this.retry); this.connected = false; await this.wire.disconnect().catch(() => {}); }
  private async limit<T>(promise: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('OBS unavailable')), 5_000); })]); }
    finally { clearTimeout(timeout); }
  }
  private ready(): void { if (!this.connected) throw new Error('OBS unavailable'); }
  async capture(): Promise<string> {
    this.ready();
    const scene = this.config.source ?? (await this.limit(this.wire.call('GetCurrentProgramScene'))).currentProgramSceneName;
    const result = await this.limit(this.wire.call('GetSourceScreenshot', { sourceName: scene, imageFormat: 'jpg', imageWidth: 768 }));
    return result.imageData;
  }
  async applyPrivacy(): Promise<void> {
    this.ready();
    if (this.config.source && this.config.blurFilter) {
      if (this.previousFilter === null) this.previousFilter = (await this.limit(this.wire.call('GetSourceFilter', { sourceName: this.config.source, filterName: this.config.blurFilter }))).filterEnabled;
      await this.limit(this.wire.call('SetSourceFilterEnabled', { sourceName: this.config.source, filterName: this.config.blurFilter, filterEnabled: true }));
    } else {
      this.previousScene ??= (await this.limit(this.wire.call('GetCurrentProgramScene'))).currentProgramSceneName;
      await this.limit(this.wire.call('SetCurrentProgramScene', { sceneName: this.config.privacyScene }));
    }
  }
  async restore(): Promise<void> {
    this.ready();
    if (this.config.source && this.config.blurFilter && this.previousFilter !== null) {
      await this.limit(this.wire.call('SetSourceFilterEnabled', { sourceName: this.config.source, filterName: this.config.blurFilter, filterEnabled: this.previousFilter }));
      this.previousFilter = null;
    } else if (this.previousScene !== null) {
      await this.limit(this.wire.call('SetCurrentProgramScene', { sceneName: this.previousScene }));
      this.previousScene = null;
    }
  }
}
