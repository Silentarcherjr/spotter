import{ObsClient}from'./client.ts';import type{ObsConfig}from'./client.ts';import type{QrConfig}from'../core/qr.ts';
export async function setupQrObs(obs:ObsConfig,qr:QrConfig):Promise<void>{const client=new ObsClient(obs);await client.start();try{await client.prepareQr(qr.source,qr.renderDelayMs);}finally{await client.stop();}}
