import OBSWebSocket from'obs-websocket-js';import{prepareQrTransitions}from'./qr-transitions.ts';
import{ObsClient}from'./client.ts';import type{ObsConfig}from'./client.ts';import type{QrConfig}from'../core/qr.ts';
export async function setupQrObs(obs:ObsConfig,qr:QrConfig,recoverTransitions=false):Promise<void>{const wire=new OBSWebSocket();const client=new ObsClient(obs,wire);await client.start();try{if(recoverTransitions)await prepareQrTransitions(wire,obs.privacyScene,true);await client.prepareQr(qr.source,qr.renderDelayMs);}finally{await client.stop();}}
