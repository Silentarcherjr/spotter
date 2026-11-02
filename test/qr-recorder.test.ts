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
