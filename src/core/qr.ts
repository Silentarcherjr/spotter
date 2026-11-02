export interface QrConfig {enabled:boolean;intervalMs:number;k:number;n:number;cleanFrames:number;dismissMs:number;renderDelayMs:number;frameWidth:number;source:string}
export function parseQrConfig(env:Record<string,string|undefined>):QrConfig{
  const integer=(key:string,fallback:number,min:number,max:number)=>{const value=env[key]===undefined||env[key]===''?fallback:Number(env[key]);if(!Number.isInteger(value)||value<min||value>max)throw Error(`Invalid ${key}`);return value;};
  if(env.QR_GUARD!==undefined&&!['','0','1'].includes(env.QR_GUARD))throw Error('QR_GUARD must be0 or1');
  const intervalMs=integer('QR_GUARD_INTERVAL_MS',150,100,200),n=integer('QR_GUARD_N',3,1,30),k=integer('QR_GUARD_K',1,1,n);
  const source=env.QR_GUARD_SOURCE||env.OBS_SOURCE||'Spotter IRL';if(!source.trim()||source.length>200||['Main','Privacy'].includes(source))throw Error('QR_GUARD_SOURCE must be an undelayed video child');
  return {enabled:env.QR_GUARD!=='0',intervalMs,k,n,cleanFrames:integer('QR_GUARD_M',Math.ceil(2000/intervalMs),1,200),dismissMs:integer('QR_GUARD_DISMISS_MS',5000,0,60000),renderDelayMs:integer('QR_GUARD_RENDER_DELAY_MS',500,0,500),frameWidth:integer('QR_GUARD_FRAME_WIDTH',1280,320,1920),source};
}
export interface QrState {active:boolean;window:boolean[];clean:number;cleanSince:number|null;suppressUntil:number;lastAt:number|null;status:'armed'|'triggered'|'unavailable'}
export const initialQr=():QrState=>({active:false,window:[],clean:0,cleanSince:null,suppressUntil:0,lastAt:null,status:'unavailable'});
export function stepQr(previous:QrState,event:{type:'sample';at:number;detected:boolean|null}|{type:'dismiss';at:number},config:QrConfig):{state:QrState;actions:('protect'|'release'|'marker'|'audit')[]}{
  if(!Number.isFinite(event.at)||event.at<0)throw Error('Invalid QR clock');
  if(event.type==='dismiss')return {state:{...previous,active:false,window:[],clean:0,cleanSince:null,suppressUntil:event.at+config.dismissMs,status:previous.status==='unavailable'?'unavailable':'armed'},actions:previous.active?['release']:[]};
  if(event.detected===null)return {state:{...previous,window:[],clean:0,cleanSince:null,status:'unavailable',lastAt:event.at},actions:[]};
  const fresh=previous.lastAt===null||event.at>previous.lastAt&&event.at-previous.lastAt<=config.intervalMs*3;
  const state:QrState={...previous,lastAt:event.at,window:[...(fresh?previous.window:[]),event.detected].slice(-config.n),clean:event.detected?0:(fresh?previous.clean:0)+1,cleanSince:event.detected?null:fresh&&previous.cleanSince!==null?previous.cleanSince:event.at,status:previous.active?'triggered':'armed'};
  if(state.active&&state.clean>=config.cleanFrames&&state.cleanSince!==null&&event.at-state.cleanSince>=config.renderDelayMs)return {state:{...state,active:false,window:[],clean:0,cleanSince:null,status:'armed'},actions:['release']};
  if(!state.active&&event.at>=state.suppressUntil&&state.window.filter(Boolean).length>=config.k)return {state:{...state,active:true,status:'triggered',clean:0,cleanSince:null},actions:['protect','marker','audit']};
  return {state,actions:[]};
}
