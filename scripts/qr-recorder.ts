import{resolve,extname,dirname}from'node:path';import{mkdir,readFile,writeFile,rename}from'node:fs/promises';import{qrRecorder,qrRecorderPreview,qrRecorderWindow}from'../src/obs/qr-recorder.ts';import type{RecorderState}from'../src/obs/qr-recorder.ts';
const mode=process.argv[2]??'prepare';
try{
  if(mode==='window'){await qrRecorderWindow('ws://127.0.0.1:4456',process.env.OBS_WEBSOCKET_PASSWORD??'');console.log('Secondary recorder targets only the named private proof window; no output started.');process.exit(0);}
  if(mode==='preview'){const image=await qrRecorderPreview('ws://127.0.0.1:4456',process.env.OBS_WEBSOCKET_PASSWORD??'');await writeFile('data/takes/qr-guard/recorder-preview.jpg',Buffer.from(image.slice(image.indexOf(',')+1),'base64'));console.log('Saved private evidence composition preview.');process.exit(0);}
  if(!['prepare','start','stop','restore'].includes(mode))throw Error('Invalid recorder command');const root=resolve('data/takes/qr-guard');await mkdir(root,{recursive:true});const file=resolve(root,'recorder-restore.json');const saved=mode==='restore'?JSON.parse(await readFile(file,'utf8')) as RecorderState:undefined;
  const result=await qrRecorder('ws://127.0.0.1:4456',process.env.OBS_WEBSOCKET_PASSWORD??'',mode as 'prepare'|'start'|'stop'|'restore',root,saved);
  if(mode==='prepare')await writeFile(file,JSON.stringify(result,null,2)+'\n',{mode:0o600});
  if(mode==='stop'&&result&&'path'in result){const label=process.argv[3]??'take';if(!/^[a-z0-9-]{1,60}$/.test(label)||dirname(result.path)!==root)throw Error('Recorder path mismatch');const output=resolve(root,`qr-proof-${label}${extname(result.path)}`);await rename(result.path,output);console.log(JSON.stringify({saved:output}));}
  else console.log(JSON.stringify({recorder:mode,secondaryOnly:true,streamStarted:false}));
}catch(error){const code=error&&typeof error==='object'&&'code'in error&&Number.isInteger(error.code)?error.code:null;console.error(JSON.stringify({error:'Evidence recorder unavailable; no credentials or stream settings displayed',code}));process.exitCode=1;}
