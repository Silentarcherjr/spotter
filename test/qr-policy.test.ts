import {test} from 'node:test';import assert from 'node:assert/strict';
import {initialQr,stepQr,parseQrConfig} from '../src/core/qr.ts';
import {privacyHold} from '../src/core/privacy.ts';
const config=parseQrConfig({});
test('QR default protects on one hit and releases only after M consecutive clean captures',()=>{
  let state=initialQr();let d=stepQr(state,{type:'sample',at:0,detected:true},config);assert.deepEqual(d.actions,['protect','marker','audit']);state=d.state;
  for(let i=1;i<config.cleanFrames;i++){d=stepQr(state,{type:'sample',at:i*150,detected:false},config);state=d.state;assert.deepEqual(d.actions,[]);}
  d=stepQr(state,{type:'sample',at:config.cleanFrames*150,detected:false},config);assert.deepEqual(d.actions,['release']);assert.equal(d.state.active,false);
});
test('QR K/N, missing samples and interruption reset clean runs without new automatic actions',()=>{
  const policy={...config,k:2,n:3};let state=initialQr();
  for(const [i,detected] of [true,false,true].entries()){const d=stepQr(state,{type:'sample',at:i*150,detected},policy);state=d.state;assert.equal(d.actions.includes('protect'),i===2);}
  const missing=stepQr(state,{type:'sample',at:500,detected:null},policy);assert.deepEqual(missing.actions,[]);assert.equal(missing.state.status,'unavailable');assert.equal(missing.state.active,true);assert.equal(missing.state.clean,0);
  assert.throws(()=>parseQrConfig({QR_GUARD_K:'4',QR_GUARD_N:'3'}));assert.equal(parseQrConfig({QR_GUARD:'0'}).enabled,false);
});
test('Dismiss suppresses a visible QR for X seconds and requires fresh window evidence afterwards',()=>{
  const active=stepQr(initialQr(),{type:'sample',at:0,detected:true},config).state;
  let d=stepQr(active,{type:'dismiss',at:100},config);assert.deepEqual(d.actions,['release']);
  let state=d.state;d=stepQr(state,{type:'sample',at:200,detected:true},config);assert.deepEqual(d.actions,[]);state=d.state;
  d=stepQr(state,{type:'sample',at:100+config.dismissMs,detected:true},config);assert.deepEqual(d.actions,['protect','marker','audit']);
});
test('independent privacy owners cannot restore over each other or steal a manual Privacy scene',()=>{
  let d=privacyHold([],'qr_guard',true);assert.deepEqual(d.actions,['protect']);
  d=privacyHold(d.state,'offthemap',true);assert.deepEqual(d.actions,[]);
  d=privacyHold(d.state,'qr_guard',false);assert.deepEqual(d.actions,[]);
  d=privacyHold(d.state,'offthemap',false);assert.deepEqual(d.actions,['restore']);assert.deepEqual(d.state,[]);
});
