import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
const require=createRequire(import.meta.url);
const { default: Writer }=require('@zxing/library/cjs/core/qrcode/QRCodeWriter.js') as typeof import('@zxing/library/cjs/core/qrcode/QRCodeWriter.js');
const { default: Format }=require('@zxing/library/cjs/core/BarcodeFormat.js') as typeof import('@zxing/library/cjs/core/BarcodeFormat.js');
export function qrFixture(options:{size?:number;angle?:number;x?:number;y?:number;width?:number;height?:number;payload?:string}={}){
  const size=options.size??180;const width=options.width??640;const height=options.height??360;const x=options.x??(width-size)/2;const y=options.y??(height-size)/2;const angle=(options.angle??0)*Math.PI/180;
  const bits=new Writer().encode(options.payload??'TEST-ONLY',Format.QR_CODE,size,size,new Map());const image=new PNG({width,height});image.data.fill(255);
  const cx=x+size/2,cy=y+size/2;const c=Math.cos(angle),s=Math.sin(angle);
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    const dx=px-cx,dy=py-cy;const sx=Math.floor(dx*c+dy*s+size/2),sy=Math.floor(-dx*s+dy*c+size/2);
    if(sx>=0&&sy>=0&&sx<size&&sy<size&&bits.get(sx,sy)){const p=(py*width+px)*4;image.data[p]=0;image.data[p+1]=0;image.data[p+2]=0;}
  }
  return PNG.sync.write(image);
}
