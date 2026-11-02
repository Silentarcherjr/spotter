import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import { qrFixture } from './helpers/qr.ts';
import { detectQr } from '../src/qr/detector.ts';
test('local QR geometry finds size/rotation variations and returns only observation fields',()=>{
  for(const options of [{size:64,angle:-35},{size:200},{size:90},{size:140,angle:25},{size:140,angle:-35}]){
    const result=detectQr(qrFixture(options));assert.equal(result.detected,true,JSON.stringify(options));assert.ok(result.box);assert.equal(result.confidence,1);
    assert.deepEqual(Object.keys(result).sort(),['box','confidence','detected']);assert.ok(result.box.x>=0&&result.box.y>=0);
  }
});
test('no QR is a clean observation; broken image is unavailable rather than clean',()=>{
  const image=new PNG({width:640,height:360});image.data.fill(255);
  assert.deepEqual(detectQr(PNG.sync.write(image)),{detected:false,box:null,confidence:0});assert.throws(()=>detectQr(Buffer.from('bad image')));
});
test('payload is never decoded, logged or exposed; payload decoder and reader modules are not loaded',()=>{
  const sentinel='PRIVATE-QR-PAYLOAD-MUST-NOT-LEAVE';const calls:unknown[][]=[];const old=console.log;console.log=(...args:unknown[])=>{calls.push(args);};
  try{const result=detectQr(qrFixture({payload:sentinel}));assert.equal(result.detected,true);assert.ok(!JSON.stringify({result,calls}).includes(sentinel));}
  finally{console.log=old;}
  const require=createRequire(import.meta.url);
  assert.ok(!Object.keys(require.cache).some(path=>/qrcode[\\/]decoder[\\/](Decoder|DecodedBitStreamParser)\.js|QRCodeReader\.js/.test(path)));
});
test('three finder-like squares without QR timing structure are not a code',()=>{
  const image=new PNG({width:640,height:360});image.data.fill(255);const module=8;
  for(const [left,top] of [[100,50],[212,50],[100,162]])for(let y=0;y<7;y++)for(let x=0;x<7;x++){
    const dark=x===0||y===0||x===6||y===6||x>=2&&x<=4&&y>=2&&y<=4;if(!dark)continue;
    for(let dy=0;dy<module;dy++)for(let dx=0;dx<module;dx++){const p=((top!+y*module+dy)*640+left!+x*module+dx)*4;image.data[p]=0;image.data[p+1]=0;image.data[p+2]=0;}
  }
  assert.equal(detectQr(PNG.sync.write(image)).detected,false);
});
