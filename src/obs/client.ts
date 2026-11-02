import OBSWebSocket from 'obs-websocket-js';
import {PNG} from 'pngjs';
import{inspectPrestream}from'./prestream.ts';
import{prepareQrTransitions}from'./qr-transitions.ts';
import{prepareQrLayout}from'./qr-layout.ts';
import { parseVisionFrameWidth } from '../config.ts';

export type ObsWire = Pick<OBSWebSocket, 'connect' | 'disconnect' | 'call' | 'on'>;
export interface ObsConfig { frameWidth?: number; url: string; password: string; privacyScene: string; source?: string; blurFilter?: string }
export class ObsClient {
  connected = false;
  private config: ObsConfig;
  private wire: ObsWire;
  private stopped = true;
  private connecting = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private qrPrepared=false;private qrCheckedAt=0;
  private qrPreparing:Promise<void>|null=null;
  private mainRestoredAt=0;
  private previousScene: string | null = null;
  private previousFilter: boolean | null = null;
  constructor(config: ObsConfig, wire: ObsWire = new OBSWebSocket()) {
    this.config = { ...config, frameWidth: parseVisionFrameWidth(config.frameWidth) }; this.wire = wire;
    wire.on('ConnectionClosed', () => { this.connected = false; this.qrPrepared=false; this.schedule(); });
    wire.on('ConnectionError', () => { this.connected = false; this.qrPrepared=false; this.schedule(); });
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
  async stop(): Promise<void> { this.stopped = true; this.qrPrepared=false; clearTimeout(this.retry); this.connected = false; await this.wire.disconnect().catch(() => {}); }
  private async limit<T>(promise: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('OBS unavailable')), 5_000); })]); }
    finally { clearTimeout(timeout); }
  }
  private ready(): void { if (!this.connected) throw new Error('OBS unavailable'); }
  async capture(): Promise<string> {
    this.ready();
    const scene = this.config.source ?? (await this.limit(this.wire.call('GetCurrentProgramScene'))).currentProgramSceneName;
    const result = await this.limit(this.wire.call('GetSourceScreenshot', { sourceName: scene, imageFormat: 'jpg', imageWidth: this.config.frameWidth! }));
    return result.imageData.replace(/^data:image\/jpg;base64,/, 'data:image/jpeg;base64,');
  }
  async prepareQr(source:string,delayMs:number):Promise<void>{
    this.ready();if(this.qrPrepared&&performance.now()-this.qrCheckedAt<1000)return;if(this.qrPreparing)return this.qrPreparing;
    const run=async()=>{
      const own='Spotter QR Render Delay';
      const raw=await this.limit(this.wire.call('GetSourceFilterList',{sourceName:source}));
      if(raw.filters.some(filter=>filter.filterEnabled&&filter.filterKind==='gpu_delay'))throw Error('QR source is delayed');
      const main=await this.limit(this.wire.call('GetSourceFilterList',{sourceName:'Main'}));
      if(main.filters.some(filter=>filter.filterName!==own&&filter.filterEnabled&&filter.filterKind==='gpu_delay'))throw Error('Unmanaged Main delay');
      const existing=(main.filters as {filterName:string;filterKind:string;filterEnabled:boolean;filterSettings?:{delay_ms?:number}}[]).find(filter=>filter.filterName===own);
      await this.limit(prepareQrTransitions(this.wire,this.config.privacyScene));
      const configured=existing?.filterKind==='gpu_delay'&&existing.filterEnabled&&existing.filterSettings?.delay_ms===delayMs;
      if(!configured){
        const stream=await this.limit(this.wire.call('GetStreamStatus'));const record=await this.limit(this.wire.call('GetRecordStatus'));
        if(stream.outputActive||record.outputActive)throw Error('Prepare QR delay before streaming');
        if(existing&&existing.filterKind!=='gpu_delay')throw Error('QR filter collision');
        if(!existing)await this.limit(this.wire.call('CreateSourceFilter',{sourceName:'Main',filterName:own,filterKind:'gpu_delay',filterSettings:{delay_ms:delayMs}}));
        else{await this.limit(this.wire.call('SetSourceFilterSettings',{sourceName:'Main',filterName:own,filterSettings:{delay_ms:delayMs}}));await this.limit(this.wire.call('SetSourceFilterEnabled',{sourceName:'Main',filterName:own,filterEnabled:true}));}
      }
      await this.limit(prepareQrLayout(this.wire,this.config.privacyScene));
      const confirmed=await this.limit(this.wire.call('GetSourceFilter',{sourceName:'Main',filterName:own}));
      if(!confirmed.filterEnabled||confirmed.filterSettings.delay_ms!==delayMs)throw Error('QR delay unavailable');
      // A scene-name acknowledgement can coexist with an empty/stalled GPU delay.
      // Check only active Main, after its expected buffer warm-up. Pixels stay in RAM.
      if(this.qrPrepared&&performance.now()-this.mainRestoredAt>delayMs+500&&(await this.limit(this.wire.call('GetCurrentProgramScene'))).currentProgramSceneName==='Main'){
        const png=PNG.sync.read(await this.capturePng('Main',320));let visible=0;
        for(let i=3;i<png.data.length;i+=4)if(png.data[i]!>0)visible++;
        if(visible<png.width*png.height*.01)throw Error('QR output unavailable');
      }
      this.qrPrepared=true;this.qrCheckedAt=performance.now();
    };
    this.qrPreparing=run();try{await this.qrPreparing;}finally{this.qrPreparing=null;}
  }
  async inspectPrestream(qrEnabled:boolean){this.ready();return this.limit(inspectPrestream(this.wire,qrEnabled));}
  async captureVisionPng():Promise<Buffer>{
    this.ready();const source=this.config.source??(await this.limit(this.wire.call('GetCurrentProgramScene'))).currentProgramSceneName;
    return this.capturePng(source,this.config.frameWidth);
  }
  async capturePng(sourceName: string, width = 1280): Promise<Buffer> {
    this.ready();
    const result=await this.limit(this.wire.call('GetSourceScreenshot',{sourceName,imageFormat:'png',imageWidth:parseVisionFrameWidth(width)}));
    if(!result.imageData.startsWith('data:image/png;base64,'))throw Error('OBS PNG unavailable');
    return Buffer.from(result.imageData.slice(result.imageData.indexOf(',')+1),'base64');
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
  async confirmPrivacy(): Promise<void> {
    this.ready();
    const confirmed = this.config.source && this.config.blurFilter
      ? (await this.limit(this.wire.call('GetSourceFilter', { sourceName: this.config.source, filterName: this.config.blurFilter }))).filterEnabled
      : (await this.limit(this.wire.call('GetCurrentProgramScene'))).currentProgramSceneName === this.config.privacyScene;
    if (!confirmed) throw new Error('Privacy not confirmed');
  }
  async restore(): Promise<void> {
    this.ready();
    if (this.config.source && this.config.blurFilter && this.previousFilter !== null) {
      await this.limit(this.wire.call('SetSourceFilterEnabled', { sourceName: this.config.source, filterName: this.config.blurFilter, filterEnabled: this.previousFilter }));
      this.previousFilter = null;
    } else if (this.previousScene !== null) {
      await this.limit(this.wire.call('SetCurrentProgramScene', { sceneName: this.previousScene }));
      if(this.previousScene==='Main')this.mainRestoredAt=performance.now();
      this.previousScene = null;
    }
  }
}
