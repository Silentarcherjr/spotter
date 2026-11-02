import{test}from'node:test';import assert from'node:assert/strict';import{PNG}from'pngjs';import{qrRecorder,qrRecorderWindow}from'../src/obs/qr-recorder.ts';import type{SetupWire}from'../src/obs/setup.ts';
test('evidence recording cannot target primary OBS or mutate a streaming secondary',async()=>{
  const calls:string[]=[];const wire={async connect(){},async disconnect(){},async call(name:string){calls.push(name);return{outputActive:true};}}as unknown as SetupWire;
  await assert.rejects(qrRecorder('ws://localhost:4455','','prepare','/tmp',undefined,wire));assert.equal(calls.length,0);
  await assert.rejects(qrRecorder('ws://localhost:4456','','prepare','/tmp',undefined,wire));assert.deepEqual(calls,['GetStreamStatus']);
});
test('native evidence fallback selects only the uniquely named proof window, never a display',async()=>{
  const calls:{name:string;args:Record<string,unknown>}[]=[];
  const wire={async connect(){},async disconnect(){},async call(name:string,args:Record<string,unknown>={}){calls.push({name,args});if(name==='GetInputPropertiesListPropertyItems')return{propertyItems:[{itemName:'Google Chrome: Spotter QR Guard — private evidence',itemValue:42,itemEnabled:true},{itemName:'Private unrelated window',itemValue:99,itemEnabled:true}]};if(name==='GetInputList')return{inputs:[]};if(name==='CreateInput')return{sceneItemId:7};return{outputActive:false};}}as unknown as SetupWire;
  await qrRecorderWindow('ws://localhost:4456','',wire);
  const create=calls.find(c=>c.name==='CreateInput')!;assert.deepEqual(create.args.inputSettings,{type:1,window:0,hide_cursor:true});
  const selected=calls.find(c=>c.name==='SetInputSettings')!;assert.deepEqual(selected.args.inputSettings,{type:1,window:42,hide_cursor:true});assert.ok(!calls.some(c=>/StartRecord|StartStream/.test(c.name)));
});
test('native recorder refreshes its own capture input rather than retaining a closed Chrome window',async()=>{
 const calls:string[]=[];const wire={async connect(){},async disconnect(){},async call(name:string){calls.push(name);if(name==='GetInputList')return{inputs:[{inputName:'Spotter QR Evidence Window'}]};if(name==='CreateInput')return{sceneItemId:8};if(name==='GetInputPropertiesListPropertyItems')return{propertyItems:[{itemEnabled:true,itemName:'Spotter QR Guard — private evidence',itemValue:88}]};return{outputActive:false};}}as unknown as SetupWire;
 await qrRecorderWindow('ws://localhost:4456','',wire);assert.ok(calls.indexOf('RemoveInput')>=0);assert.ok(calls.indexOf('RemoveInput')<calls.indexOf('CreateInput'));assert.ok(calls.indexOf('CreateInput')<calls.indexOf('GetInputPropertiesListPropertyItems'));
});
test('evidence recorder refuses a black browser composition before starting output',async()=>{
  const png=new PNG({width:32,height:18});png.data.fill(0);const calls:string[]=[];
  const wire={async connect(){},async disconnect(){},async call(name:string){calls.push(name);return name==='GetSourceScreenshot'?{imageData:'data:image/png;base64,'+PNG.sync.write(png).toString('base64')}:{outputActive:false};}}as unknown as SetupWire;
  await assert.rejects(qrRecorder('ws://localhost:4456','','start','/tmp',undefined,wire),/blank/);assert.ok(!calls.includes('StartRecord'));
});
test('private recording uses a fresh blank profile and restores the prior profile without reading service credentials',async()=>{
 let profile='Original companion';let created='';let persisted=false;let muted=false;const calls:{name:string;args:Record<string,unknown>}[]=[];
 const video={baseWidth:1280,baseHeight:720,outputWidth:1280,outputHeight:720,fpsNumerator:30,fpsDenominator:1};
 const wire={async connect(){},async disconnect(){},async call(name:string,args:Record<string,unknown>={}){calls.push({name,args});if(name==='GetStreamStatus'||name==='GetRecordStatus')return{outputActive:false};if(name==='GetSceneList')return{scenes:[]};if(name==='GetVideoSettings')return video;if(name==='GetCurrentProgramScene')return{currentProgramSceneName:'Main'};if(name==='GetRecordDirectory')return{recordDirectory:'/tmp/original'};if(name==='GetProfileList')return{currentProfileName:profile,profiles:[profile,created].filter(Boolean)};if(name==='CreateProfile'){created=String(args.profileName);return{};}if(name==='SetCurrentProfile'){profile=String(args.profileName);return{};}if(name==='GetInputList')return{inputs:[{inputName:'Mic/Aux'}]};if(name==='GetInputMute')return{inputMuted:muted};if(name==='SetInputMute'){muted=args.inputMuted===true;return{};}return{};}}as unknown as SetupWire;
 const state=await qrRecorder('ws://localhost:4456','','prepare','/tmp/evidence',undefined,wire,async()=>{assert.equal(profile,'Original companion');persisted=true;});assert.ok(persisted);assert.ok(state&&'scene'in state);assert.match(profile,/^Spotter LOCAL RECORDING ONLY /);assert.equal(muted,true);assert.ok(calls.some(c=>c.name==='CreateProfile'));assert.ok(!calls.some(c=>/StreamServiceSettings|DuplicateProfile|StartStream/.test(c.name)));
 await qrRecorder('ws://localhost:4456','','restore','/tmp/evidence',state,wire);assert.equal(profile,'Original companion');assert.equal(muted,false);
});
test('record stop waits for actual inactive output before returning a file for rename/restoration',async()=>{
 let reads=0;let stopping=false;const wire={async connect(){},async disconnect(){},async call(name:string){if(name==='GetStreamStatus')return{outputActive:false};if(name==='GetRecordStatus'){reads++;return{outputActive:!stopping||reads<3};}if(name==='StopRecord'){stopping=true;return{outputPath:'/tmp/local.mov'};}throw Error('Unexpected request');}}as unknown as SetupWire;
 const result=await qrRecorder('ws://localhost:4456','','stop','/tmp',undefined,wire);assert.ok(reads>=3);assert.deepEqual(result,{path:'/tmp/local.mov'});
});
