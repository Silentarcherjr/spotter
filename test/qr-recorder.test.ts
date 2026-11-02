import{test}from'node:test';import assert from'node:assert/strict';import{qrRecorder}from'../src/obs/qr-recorder.ts';import type{SetupWire}from'../src/obs/setup.ts';
test('evidence recording cannot target primary OBS or mutate a streaming secondary',async()=>{
  const calls:string[]=[];const wire={async connect(){},async disconnect(){},async call(name:string){calls.push(name);return{outputActive:true};}}as unknown as SetupWire;
  await assert.rejects(qrRecorder('ws://localhost:4455','','prepare','/tmp',undefined,wire));assert.equal(calls.length,0);
  await assert.rejects(qrRecorder('ws://localhost:4456','','prepare','/tmp',undefined,wire));assert.deepEqual(calls,['GetStreamStatus']);
});
