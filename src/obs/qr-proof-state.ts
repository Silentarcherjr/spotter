import OBSWebSocket from 'obs-websocket-js';
import{PNG}from'pngjs';
import type{SetupWire}from'./setup.ts';
/** Read-only, closed numeric diagnostics. No images/settings/payloads are returned. */
export async function readQrProofState(url:string,password:string,source:string,wire:SetupWire=new OBSWebSocket()){
 await wire.connect(url,password);
 try{
  const input=await wire.call('GetInputSettings',{inputName:source});
  const items=(await wire.call('GetSceneItemList',{sceneName:'Main'})).sceneItems;
  const filter=await wire.call('GetSourceFilter',{sourceName:'Main',filterName:'Spotter QR Render Delay'});
  const shot=await wire.call('GetSourceScreenshot',{sourceName:'Main',imageFormat:'png',imageWidth:320});
  const png=PNG.sync.read(Buffer.from(shot.imageData.split(',')[1]!,'base64'));
  let opaquePixels=0;for(let i=3;i<png.data.length;i+=4)if(png.data[i]!>0)opaquePixels++;
  return{at:Date.now(),scene:(await wire.call('GetCurrentProgramScene')).currentProgramSceneName,testInput:typeof input.inputSettings.local_file==='string'&&input.inputSettings.local_file.endsWith('/data/takes/qr-guard/motion-loop.mp4'),cursor:(await wire.call('GetMediaInputStatus',{inputName:source})).mediaCursor??null,mainDelayEnabled:filter.filterEnabled,mainDelayMs:Number(filter.filterSettings.delay_ms),rawItemEnabled:items.find(i=>i.sourceName===source)?.sceneItemEnabled===true,opaquePixels,totalPixels:png.width*png.height,mainPixel:Array.from(png.data.subarray(0,3))};
 }finally{await wire.disconnect().catch(()=>{});}
}
