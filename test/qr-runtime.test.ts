import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {QrGuard} from '../src/modules/qrguard/runtime.ts';import {PrivacyCoordinator} from '../src/modules/privacy.ts';import {parseQrConfig} from '../src/core/qr.ts';
import {detectQr} from '../src/qr/detector.ts';import {qrFixture} from './helpers/qr.ts';import {createApp} from '../src/app.ts';import type {ObsWire} from '../src/obs/client.ts';
const config=parseQrConfig({});
const timing=()=>({captureMs:0,detectorMs:0,started:performance.now()});
test('QR audit/latency contain no payload, and release never removes another privacy owner',async()=>{
  const sentinel='TEST-ONLY-NEVER-IN-AUDIT';const db=new DatabaseSync(':memory:');let protects=0;let restores=0;let markers=0;
  const privacy=new PrivacyCoordinator({protect:async()=>{protects++;},restore:async()=>{restores++;}});
  const qr=new QrGuard(config,db,{protect:()=>privacy.hold('qr_guard',true),confirm:async()=>{},release:()=>privacy.hold('qr_guard',false),marker:async()=>{markers++;}});
  try{
    await qr.observe(detectQr(qrFixture({payload:sentinel})),timing());await privacy.hold('offthemap',true);await qr.dismiss();
    assert.equal(protects,1);assert.equal(restores,0);await privacy.hold('offthemap',false);assert.equal(restores,1);assert.equal(markers,1);
    const output=JSON.stringify({snapshot:qr.snapshot(),database:db.prepare('SELECT * FROM qr_audit').all()});assert.ok(!output.includes(sentinel));assert.ok(output.includes('qr_guard'));assert.equal(qr.snapshot().latency.detectionToScene.n,1);
  }finally{await qr.stop();db.close();}
});
test('capture/action unavailability cannot trigger a new action and resets consecutive clean recovery',async()=>{
  const db=new DatabaseSync(':memory:');let actions=0;let available=false;const qr=new QrGuard(config,db,{available:()=>available,protect:async()=>{actions++;},confirm:async()=>{},release:async()=>{actions++;},marker:async()=>{}});
  try{
    await qr.observe({detected:true,box:null,confidence:1},timing());assert.equal(actions,0);assert.equal(qr.snapshot().status,'unavailable');
    available=true;await qr.observe({detected:true,box:null,confidence:1},timing());assert.equal(actions,1);qr.unavailable();assert.equal(qr.snapshot().active,true);assert.equal(qr.snapshot().status,'unavailable');
    await qr.observe({detected:false,box:null,confidence:0},timing());assert.equal(actions,1);
  }finally{await qr.stop();db.close();}
});
test('integrated QR pipeline withholds QR frames from AI and payload from API, SQL projection and public overlay',async()=>{
  const sentinel='TEST-ONLY-API-LEAK-SENTINEL';const png=qrFixture({payload:sentinel});let scene='Main';let aiCalls=0;
  const wire={on(){},async connect(){},async disconnect(){},async call(name:string,data?:Record<string,unknown>){
    if(name==='GetSourceFilterList')return {filters:data?.sourceName==='Main'?[{filterName:'Spotter QR Render Delay',filterKind:'gpu_delay',filterEnabled:true,filterSettings:{delay_ms:500}}]:[]};
    if(name==='GetSceneTransitionList')return {transitions:[{transitionName:'Cut',transitionKind:'cut_transition'}]};
    if(name==='GetSceneSceneTransitionOverride')return {transitionName:'Cut',transitionDuration:null};
    if(name==='GetSourceFilter')return {filterEnabled:true,filterSettings:{delay_ms:500}};
    if(name==='GetCurrentProgramScene')return {currentProgramSceneName:scene};
    if(name==='SetCurrentProgramScene'){scene=String(data?.sceneName);return {};}
    if(name==='GetSourceScreenshot')return {imageData:`data:image/png;base64,${png.toString('base64')}`};
    return {outputActive:false};
  }} as unknown as ObsWire;
  const app=createApp({databasePath:':memory:',simulated:false,visionCaptureIntervalMs:1000,obs:{url:'ws://local',password:'fake',privacyScene:'Privacy',source:'Spotter IRL'},obsWire:wire,ai:{key:'fake',model:'fake',fetcher:async()=>{aiCalls++;throw Error('QR must not reach AI');}}});
  try{
    await app.ready();await new Promise(resolve=>setTimeout(resolve,1200));
    const qr=(await app.inject('/api/qr')).json();assert.equal(qr.active,true);assert.equal(scene,'Privacy');assert.equal(aiCalls,0);
    for(const path of ['/api/qr','/api/status','/api/overlay','/api/report']){const response=await app.inject(path);assert.ok(!response.body.includes(sentinel));assert.ok(!response.body.includes('data:image'));if(path==='/api/overlay')assert.ok(!/qr_guard|qrGuard|qrEvents|latency/i.test(response.body));}
    const preview=await app.inject({url:'/api/private/frame',headers:{'X-Spotter-Preview':'private-dashboard'}});assert.equal(preview.json(),null);
    const dismissed=await app.inject({method:'POST',url:'/api/privacy/dismiss'});assert.equal(dismissed.statusCode,200);assert.equal(scene,'Main');
    await new Promise(resolve=>setTimeout(resolve,200));const after=(await app.inject('/api/qr')).json();assert.equal(after.active,false);assert.ok(after.suppressUntil>Date.now());assert.equal(scene,'Main');
  }finally{await app.close();}
});
test('OBS restoration flushes delayed Main frames before exposing it again',async()=>{
  const {ObsClient}=await import('../src/obs/client.ts');const calls:string[]=[];let scene='Main';
  const wire={on(){},async connect(){},async disconnect(){},async call(name:string,data?:Record<string,unknown>){
    calls.push(`${name}:${data?.sceneName??''}`);
    if(name==='GetSourceFilterList')return {filters:data?.sourceName==='Main'?[{filterName:'Spotter QR Render Delay',filterKind:'gpu_delay',filterEnabled:true,filterSettings:{delay_ms:500}}]:[]};
    if(name==='GetSceneTransitionList')return {transitions:[{transitionName:'Cut',transitionKind:'cut_transition'}]};
    if(name==='GetSceneSceneTransitionOverride')return {transitionName:'Cut'};
    if(name==='GetSourceFilter')return {filterEnabled:true,filterSettings:{delay_ms:500}};
    if(name==='GetCurrentProgramScene')return {currentProgramSceneName:scene};
    if(name==='SetCurrentProgramScene'){scene=String(data?.sceneName);return {};}
    return {};
  }} as unknown as ObsWire;
  const obs=new ObsClient({url:'ws://local',password:'',privacyScene:'Privacy'},wire);
  await obs.start();try{await obs.prepareQr('Camera',500);await obs.applyPrivacy();calls.length=0;await obs.restore();assert.equal(scene,'Main');assert.ok(calls.indexOf('SetSourceFilterSettings:')<calls.indexOf('SetCurrentProgramScene:Main'));}finally{await obs.stop();}
});
