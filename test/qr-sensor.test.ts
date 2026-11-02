import { test } from 'node:test';import assert from 'node:assert/strict';
import { QrSensor } from '../src/qr/sensor.ts';import { qrFixture } from './helpers/qr.ts';
test('local capture loop reports only observations and sanitized failure, not image or QR content',async()=>{
  const sentinel='TEST-ONLY-SENSOR-PAYLOAD';const results:unknown[]=[];let fails=false;let unavailable=0;
  const sensor=new QrSensor({capture:async()=>{if(fails)throw Error(sentinel);return qrFixture({payload:sentinel});},observe:async(value,timing)=>{results.push({value,timing});},unavailable:()=>{unavailable++;}});
  await sensor.sample();fails=true;await sensor.sample();assert.equal(unavailable,1);assert.equal(results.length,1);assert.ok(!JSON.stringify(results).includes(sentinel));assert.ok(!JSON.stringify(results).includes('image'));
});
test('stopping invalidates a pending capture and overlapping samples do not queue',async()=>{
  let finish!:(value:Buffer)=>void;let captures=0;let observations=0;
  const sensor=new QrSensor({capture:async()=>{captures++;return new Promise(resolve=>{finish=resolve;});},observe:async()=>{observations++;},unavailable:()=>{}});
  const pending=sensor.sample();await sensor.sample();sensor.stop();finish(qrFixture());await pending;assert.equal(captures,1);assert.equal(observations,0);
  assert.throws(()=>new QrSensor({capture:async()=>Buffer.alloc(0),observe:async()=>{},unavailable:()=>{}},50));
});
