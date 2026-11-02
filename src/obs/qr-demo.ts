import OBSWebSocket from 'obs-websocket-js';
export interface QrDemoState{source:string;scene:string;settings:Record<string,string|number|boolean>;item:{id:number;positionX:number;positionY:number;scaleX:number;scaleY:number};mediaState:string;mediaCursor:number|null}
export async function qrDemo(url:string,password:string,source:string,path:string|null,restore?:QrDemoState):Promise<QrDemoState|null>{
  const wire=new OBSWebSocket();await wire.connect(url,password);
  try{
    if((await wire.call('GetStreamStatus')).outputActive||(await wire.call('GetRecordStatus')).outputActive)throw Error('Stop outputs before changing QR demo');
    if(restore){
      await wire.call('SetInputSettings',{inputName:restore.source,inputSettings:restore.settings,overlay:true});await wire.call('SetSceneItemTransform',{sceneName:'Main',sceneItemId:restore.item.id,sceneItemTransform:restore.item});
      await wire.call('SetCurrentProgramScene',{sceneName:restore.scene});if(restore.mediaCursor!==null)await wire.call('SetMediaInputCursor',{inputName:restore.source,mediaCursor:restore.mediaCursor});
      await wire.call('TriggerMediaInputAction',{inputName:restore.source,mediaAction:restore.mediaState==='OBS_MEDIA_STATE_PLAYING'?'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY':restore.mediaState==='OBS_MEDIA_STATE_PAUSED'?'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE':'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP'});return null;
    }
    if(!path)throw Error('Provide synthetic input');
    const input=await wire.call('GetInputSettings',{inputName:source});if(input.inputKind!=='ffmpeg_source'||input.inputSettings.is_local_file!==true)throw Error('QR demo requires existing local media input');
    const settings:Record<string,string|number|boolean>={};for(const key of ['local_file','is_local_file','looping','restart_on_activate','close_when_inactive']){const value=input.inputSettings[key];if(['string','number','boolean'].includes(typeof value))settings[key]=value as string|number|boolean;}
    const item=((await wire.call('GetSceneItemList',{sceneName:'Main'})).sceneItems as {sourceName:string;sceneItemId:number}[]).find(value=>value.sourceName===source);if(!item)throw Error('Media source missing');
    const transform=(await wire.call('GetSceneItemTransform',{sceneName:'Main',sceneItemId:item.sceneItemId})).sceneItemTransform as {positionX:number;positionY:number;scaleX:number;scaleY:number};
    const media=await wire.call('GetMediaInputStatus',{inputName:source});const state:QrDemoState={source,scene:(await wire.call('GetCurrentProgramScene')).currentProgramSceneName,settings,item:{id:item.sceneItemId,positionX:transform.positionX,positionY:transform.positionY,scaleX:transform.scaleX,scaleY:transform.scaleY},mediaState:media.mediaState,mediaCursor:media.mediaCursor??null};
    await wire.call('SetInputSettings',{inputName:source,inputSettings:{is_local_file:true,local_file:path,looping:true,restart_on_activate:false,close_when_inactive:false},overlay:true});
    const video=await wire.call('GetVideoSettings');await wire.call('SetSceneItemTransform',{sceneName:'Main',sceneItemId:item.sceneItemId,sceneItemTransform:{positionX:0,positionY:0,scaleX:video.baseWidth/1280,scaleY:video.baseHeight/720}});
    await wire.call('SetCurrentProgramScene',{sceneName:'Main'});await wire.call('TriggerMediaInputAction',{inputName:source,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'});return state;
  }finally{await wire.disconnect().catch(()=>{});}
}
