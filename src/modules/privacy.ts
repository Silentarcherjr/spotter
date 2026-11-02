import {privacyHold} from '../core/privacy.ts';import type {PrivacyOwner} from '../core/privacy.ts';
export class PrivacyCoordinator{
  private owners:PrivacyOwner[]=[];private queue:Promise<void>=Promise.resolve();private dependencies:{protect:()=>Promise<void>;restore:()=>Promise<void>};
  constructor(dependencies:{protect:()=>Promise<void>;restore:()=>Promise<void>}){this.dependencies=dependencies;}
  hold(owner:PrivacyOwner,enabled:boolean):Promise<void>{
    const run=this.queue.then(async()=>{const decision=privacyHold(this.owners,owner,enabled);for(const action of decision.actions)await(action==='protect'?this.dependencies.protect():this.dependencies.restore());this.owners=decision.state;});
    this.queue=run.catch(()=>{});return run;
  }
}
