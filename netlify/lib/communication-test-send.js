import { identifier, exactFields, fail } from './account-contract.js';
import { renderCommunication, syntheticContext } from './communication-contract.js';
import { communicationEmail } from './communication-email.js';

// Internal verification only: no Customer recipient, Notification, source event,
// Attention item or live business render is created. Provider remains a trusted
// adapter; the browser cannot supply a destination or real Customer context.
export function createCommunicationTestSend(account, configuration, { provider, origin } = {}) {
  const { db,ref,keyed,now,auth }=account;
  async function read(claims,operationId) {
    identifier(operationId);
    const result=await db.runTransaction(async tx=>{
      const receipt=(await tx.get(ref(`communicationTestSends/${operationId}`))).data();
      if(!receipt||!await account.ownsResult(tx,claims,receipt,operationId,'communication-test'))return{state:'OUTCOME UNCERTAIN'};
      await configuration.authorize(tx,claims,receipt.configurationId,'read');
      return{state:receipt.state,operationId,configurationId:receipt.configurationId};
    });
    if(result.configurationId&&['PROCESSING','OUTCOME UNCERTAIN'].includes(result.state)&&provider?.reconcile){
      let known;try{known=await provider.reconcile(keyed(`internal-test:${operationId}`));}catch{known='unknown';}
      if(known==='applied')return db.runTransaction(async tx=>{await configuration.authorize(tx,claims,result.configurationId,'read');const path=ref(`communicationTestSends/${operationId}`),receipt=(await tx.get(path)).data();if(!await account.ownsResult(tx,claims,receipt,operationId,'communication-test'))fail();tx.update(path,{state:'PROVIDER ACCEPTED',observedAt:now()});return{state:'PROVIDER ACCEPTED',operationId};});
    }
    return{state:result.state,operationId};
  }
  async function send(claims,input) {
    exactFields(input,['configurationId','operationId','value','preset']);identifier(input.operationId);
    const render=renderCommunication(input.configurationId,input.value,syntheticContext(input.configurationId,input.preset));
    const fingerprint=keyed(JSON.stringify({uid:claims.uid,input})),path=ref(`communicationTestSends/${input.operationId}`);
    const prepare=await db.runTransaction(async tx=>{
      const staff=await configuration.authorize(tx,claims,input.configurationId,'edit'),prior=(await tx.get(path)).data();
      if(prior){if(prior.fingerprint!==fingerprint||prior.actor.staffId!==staff.staffId)fail('operation-conflict',409);return prior;}
      if(!provider?.reconcile||!provider?.send)return null;
      const record={configurationId:input.configurationId,actorUid:claims.uid,actor:{kind:'staff',staffId:staff.staffId},fingerprint,state:'PROCESSING',render:{...render,subject:`[TEST] ${render.subject}`,preheader:`[TEST] ${render.preheader}`},createdAt:now()};
      tx.create(path,record);return record;
    });
    if(!prepare)return{state:'ROUTE UNAVAILABLE',operationId:input.operationId};
    if(prepare.state==='PROVIDER ACCEPTED')return{state:prepare.state,operationId:input.operationId};
    const key=keyed(`internal-test:${input.operationId}`);
    let known;try{known=await provider.reconcile(key);}catch{known='unknown';}
    if(known==='applied'){await path.update({state:'PROVIDER ACCEPTED',observedAt:now()});return{state:'PROVIDER ACCEPTED',operationId:input.operationId};}
    if(known!=='not-applied')return{state:'OUTCOME UNCERTAIN',operationId:input.operationId};
    const destination=await auth.getUser(claims.uid);
    if(!destination.emailVerified||destination.disabled||!destination.email)fail('internal-test-destination-unavailable',409);
    const lease=keyed(`test-lease:${input.operationId}:${now()}`);
    // Concurrent calls cannot both claim an external send. A claimed attempt is
    // never reclaimed automatically; an unknown/crashed attempt reconciles only.
    const claimed=await db.runTransaction(async tx=>{
      const staff=await configuration.authorize(tx,claims,input.configurationId,'edit'),latest=(await tx.get(path)).data();
      if(staff.staffId!==prepare.actor.staffId||latest.attemptId)return false;
      tx.update(path,{attemptId:lease,state:'PROCESSING'});return true;
    });
    if(!claimed)return{state:'OUTCOME UNCERTAIN',operationId:input.operationId};
    const email=communicationEmail(prepare.render,{origin,route:'/admin/notifications/templates'});
    let result;try{result=await provider.send({idempotencyKey:key,destination:destination.email,render:prepare.render,email,test:true});}catch{result=null;}
    const state=result?.state==='applied'?'PROVIDER ACCEPTED':'OUTCOME UNCERTAIN';
    await path.update({state,observedAt:now()});return{state,operationId:input.operationId};
  }
  return{send,read};
}
