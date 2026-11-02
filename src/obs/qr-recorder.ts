import OBSWebSocket from 'obs-websocket-js';import type {SetupWire} from './setup.ts';
export interface RecorderState{scene:string;directory:string;video:{baseWidth:number;baseHeight:number;outputWidth:number;outputHeight:number;fpsNumerator:number;fpsDenominator:number}}
const sceneName='Spotter QR Evidence';const inputName='Spotter QR Evidence Browser';
export async function qrRecorder(url:string,password:string,mode:'prepare'|'start'|'stop'|'restore',directory:string,state?:RecorderState,wire:SetupWire=new OBSWebSocket()):Promise<RecorderState|{path:string}|null>{
  if(new URL(url).port!=='4456')throw Error('Evidence recorder must use secondary OBS4456');
  await wire.connect(url,password);
  try{
    if((await wire.call('GetStreamStatus')).outputActive)throw Error('Secondary recorder must not stream');
    const recording=(await wire.call('GetRecordStatus')).outputActive;
    if(mode==='stop'){if(!recording)throw Error('Recorder not recording');return {path:(await wire.call('StopRecord')).outputPath};}
    if(recording)throw Error('Recorder already active');
    if(mode==='start'){await wire.call('StartRecord');return null;}
    if(mode==='restore'){
      if(!state)throw Error('Recorder state unavailable');await wire.call('SetCurrentProgramScene',{sceneName:state.scene});await wire.call('RemoveInput',{inputName});await wire.call('RemoveScene',{sceneName});await wire.call('SetRecordDirectory',{recordDirectory:state.directory});await wire.call('SetVideoSettings',state.video);return null;
    }
    const list=await wire.call('GetSceneList');if(list.scenes.some(scene=>scene.sceneName===sceneName))throw Error('Evidence scene already exists');
    const video=await wire.call('GetVideoSettings');const saved:RecorderState={scene:(await wire.call('GetCurrentProgramScene')).currentProgramSceneName,directory:(await wire.call('GetRecordDirectory')).recordDirectory,video};
    await wire.call('SetVideoSettings',{baseWidth:1920,baseHeight:1080,outputWidth:1920,outputHeight:1080,fpsNumerator:60,fpsDenominator:1});await wire.call('SetRecordDirectory',{recordDirectory:directory});
    await wire.call('CreateScene',{sceneName});await wire.call('CreateInput',{sceneName,inputName,inputKind:'browser_source',inputSettings:{url:'http://localhost:3231/',width:1920,height:1080,fps:60,fps_custom:true,shutdown:false,css:'body { margin:0; overflow:hidden; }'},sceneItemEnabled:true});
    await wire.call('SetCurrentProgramScene',{sceneName});return saved;
  }finally{await wire.disconnect().catch(()=>{});}
}
export async function qrRecorderPreview(url:string,password:string):Promise<string>{
  if(new URL(url).port!=='4456')throw Error('Secondary evidence preview only');const wire=new OBSWebSocket();
  try{await wire.connect(url,password);return(await wire.call('GetSourceScreenshot',{sourceName:sceneName,imageFormat:'jpg',imageWidth:1920,imageCompressionQuality:65})).imageData;}
  finally{await wire.disconnect().catch(()=>{});}
}
