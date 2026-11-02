import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
const require=createRequire(import.meta.url);
// Deliberately import geometry/binarization modules, NEVER QRCodeReader or payload Decoder.
const {default: Detector}=require('@zxing/library/cjs/core/qrcode/detector/Detector.js') as typeof import('@zxing/library/cjs/core/qrcode/detector/Detector.js');
const {default: Luminance}=require('@zxing/library/cjs/core/RGBLuminanceSource.js') as typeof import('@zxing/library/cjs/core/RGBLuminanceSource.js');
const {default: Binarizer}=require('@zxing/library/cjs/core/common/HybridBinarizer.js') as typeof import('@zxing/library/cjs/core/common/HybridBinarizer.js');
const {default: Hint}=require('@zxing/library/cjs/core/DecodeHintType.js') as typeof import('@zxing/library/cjs/core/DecodeHintType.js');
export interface QrObservation {detected:boolean;box:{x:number;y:number;width:number;height:number}|null;confidence:number}
export function detectQr(bytes:Buffer):QrObservation{
  if(bytes.length<24||bytes.length>12_000_000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('QR detector unavailable');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(width<16||height<16||width>4096||height>2304)throw Error('QR detector unavailable');
  let image:ReturnType<typeof PNG.sync.read>;
  try{image=PNG.sync.read(bytes,{checkCRC:true});}catch{throw Error('QR detector unavailable');}
  const gray=new Uint8ClampedArray(width*height);
  for(let i=0;i<gray.length;i++){const p=i*4;const alpha=image.data[p+3]!/255;gray[i]=Math.round((image.data[p]!+2*image.data[p+1]!+image.data[p+2]!)/4*alpha+255*(1-alpha));}
  try{
    const matrix=new Binarizer(new Luminance(gray,width,height)).getBlackMatrix();
    const located=new Detector(matrix).detect(new Map([[Hint.TRY_HARDER,true]]));
    const points=located.getPoints();if(points.length<3)throw Error('Invalid geometry');
    const [bottomLeft,topLeft,topRight]=points;
    const xs=[bottomLeft!.getX(),topLeft!.getX(),topRight!.getX(),bottomLeft!.getX()+topRight!.getX()-topLeft!.getX()];
    const ys=[bottomLeft!.getY(),topLeft!.getY(),topRight!.getY(),bottomLeft!.getY()+topRight!.getY()-topLeft!.getY()];
    const pad=Math.max(4,Math.hypot(xs[2]!-xs[1]!,ys[2]!-ys[1]!)*.22);
    const x=Math.max(0,Math.floor(Math.min(...xs)-pad)),y=Math.max(0,Math.floor(Math.min(...ys)-pad));
    const right=Math.min(width,Math.ceil(Math.max(...xs)+pad)),bottom=Math.min(height,Math.ceil(Math.max(...ys)+pad));
    if(![x,y,right,bottom].every(Number.isFinite)||right<=x||bottom<=y)throw Error('Invalid geometry');
    // Binary structural-match confidence, NOT a calibrated probability or decoded validity check.
    return {detected:true,box:{x,y,width:right-x,height:bottom-y},confidence:1};
  }catch(error){
    if(error instanceof Error&&['NotFoundException','FormatException'].includes(error.constructor.name))return {detected:false,box:null,confidence:0};
    throw Error('QR detector unavailable');
  }
}
