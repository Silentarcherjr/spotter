import OBSWebSocket from 'obs-websocket-js';
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
      const transition=await this.limit(this.wire.call('GetSceneTransitionList'));
      const cut=(transition.transitions as {transitionKind:string;transitionName:string}[]).find(value=>value.transitionKind==='cut_transition');if(!cut)throw Error('Cut transition missing');
      const privacy=await this.limit(this.wire.call('GetSceneSceneTransitionOverride',{sceneName:this.config.privacyScene}));
      const configured=existing?.filterKind==='gpu_delay'&&existing.filterEnabled&&existing.filterSettings?.delay_ms===delayMs;
      if(!configured||privacy.transitionName!==cut.transitionName){
        const stream=await this.limit(this.wire.call('GetStreamStatus'));const record=await this.limit(this.wire.call('GetRecordStatus'));
        if(stream.outputActive||record.outputActive)throw Error('Prepare QR delay before streaming');
        if(existing&&existing.filterKind!=='gpu_delay')throw Error('QR filter collision');
        if(!existing)await this.limit(this.wire.call('CreateSourceFilter',{sourceName:'Main',filterName:own,filterKind:'gpu_delay',filterSettings:{delay_ms:delayMs}}));
        else{await this.limit(this.wire.call('SetSourceFilterSettings',{sourceName:'Main',filterName:own,filterSettings:{delay_ms:delayMs}}));await this.limit(this.wire.call('SetSourceFilterEnabled',{sourceName:'Main',filterName:own,filterEnabled:true}));}
        await this.limit(this.wire.call('SetSceneSceneTransitionOverride',{sceneName:this.config.privacyScene,transitionName:cut.transitionName}));
      }
      const confirmed=await this.limit(this.wire.call('GetSourceFilter',{sourceName:'Main',filterName:own}));
      if(!confirmed.filterEnabled||confirmed.filterSettings.delay_ms!==delayMs)throw Error('QR delay unavailable');
      this.qrPrepared=true;this.qrCheckedAt=performance.now();
    };
    this.qrPreparing=run();try{await this.qrPreparing;}finally{this.qrPreparing=null;}
  }
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
      if(this.qrPrepared&&this.previousScene==='Main'){const filter=await this.limit(this.wire.call('GetSourceFilter',{sourceName:'Main',filterName:'Spotter QR Render Delay'}));await this.limit(this.wire.call('SetSourceFilterSettings',{sourceName:'Main',filterName:'Spotter QR Render Delay',filterSettings:{delay_ms:Number(filter.filterSettings.delay_ms)}}));}
      await this.limit(this.wire.call('SetCurrentProgramScene', { sceneName: this.previousScene }));
      this.previousScene = null;
    }
  }
}
