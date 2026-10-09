import { exactFields, fail, identifier, requireFresh } from './account-contract.js';
import { resolveStaffIdentity } from './staff-authority.js';
import { OWNER_PROFILE, SUPER_ADMIN_PROFILE, effectiveAdminCapabilities, superAdminCapabilities } from '../../src/services/superAdminPolicy.js';

export function createStaffManagement(service) {
  const {db,ref,keyed,now}=service;
  async function owner(tx,claims,fresh=false) {
    const staff=await resolveStaffIdentity(tx,db,claims,now());
    const record=(await tx.get(ref(`staffOwners/${claims.uid}`))).data();
    if(staff.accessProfile!==OWNER_PROFILE||record?.active!==true||record.principalUid!==claims.uid||record.staffId!==staff.staffId)fail();
    if(fresh)requireFresh(claims,300,now());
    return staff;
  }
  const describe=(uid,raw,isOwner)=>({uid,staffId:raw.staffId||null,displayName:raw.displayName||raw.adminContactEmail||'Admin',email:raw.adminContactEmail||'',active:raw.active===true,
    role:isOwner?'Owner':'Super Admin',owner:isOwner,version:raw.accessVersion||0,disabledCapabilities:raw.allCapabilitiesDisabled?Object.keys(superAdminCapabilities({paymentReview:true})):raw.disabledCapabilities||[],
    migrated:[OWNER_PROFILE,SUPER_ADMIN_PROFILE].includes(raw.accessProfile)});
  async function list(claims) {
    return db.runTransaction(async tx=>{
      await owner(tx,claims);
      const [rows,owners]=await Promise.all([tx.get(db.collection('admins').limit(101)),tx.get(db.collection('staffOwners'))]);
      const protectedIds=new Set(owners.docs.map(row=>row.id));
      return {records:rows.docs.slice(0,100).map(row=>describe(row.id,row.data(),protectedIds.has(row.id))),complete:rows.size<=100,
        capabilities:Object.keys(superAdminCapabilities({paymentReview:true})).sort()};
    });
  }
  async function change(claims,input) {
    exactFields(input,['operationId','uid','expectedVersion','action','capability','enabled']);
    const operationId=identifier(input.operationId),uid=identifier(input.uid);
    if(!['capability','active','all'].includes(input.action)||typeof input.enabled!=='boolean'||!Number.isSafeInteger(input.expectedVersion))fail('invalid-argument',400);
    const catalog=superAdminCapabilities({paymentReview:true});
    if(input.action==='capability'&&!Object.hasOwn(catalog,input.capability))fail('invalid-argument',400);
    const fingerprint=keyed(JSON.stringify({actorUid:claims.uid,input}));
    return db.runTransaction(async tx=>{
      const actor=await owner(tx,claims,true),path=ref(`admins/${uid}`),operationRef=ref(`staffAccessOperations/${operationId}`);
      const [current,protectedOwner,receipt]=await Promise.all([tx.get(path),tx.get(ref(`staffOwners/${uid}`)),tx.get(operationRef)]);
      if(protectedOwner.exists||uid===claims.uid)fail('protected-owner');
      const raw=current.data();if(!raw||raw.accessProfile!==SUPER_ADMIN_PROFILE||!raw.staffId||raw.sharedAccount===true)fail();
      if(receipt.exists){if(receipt.data().fingerprint!==fingerprint)fail('operation-conflict',409);return receipt.data().result;}
      if(raw.accessVersion!==input.expectedVersion)fail('stale-conflict',409);
      const identityRef=ref(`staffIdentities/${identifier(raw.staffId)}`),identity=(await tx.get(identityRef)).data();
      if(!identity||identity.staffId!==raw.staffId||identity.principalUid!==uid)fail('staff-binding-ambiguous');
      const disabled=new Set(raw.disabledCapabilities||[]);
      if(input.action==='all'){for(const cap of Object.keys(catalog))input.enabled?disabled.delete(cap):disabled.add(cap);}
      if(input.action==='capability')input.enabled?disabled.delete(input.capability):disabled.add(input.capability);
      const updated={...raw,disabledCapabilities:[...disabled].sort(),accessVersion:raw.accessVersion+1};
      if(input.action==='all')updated.allCapabilitiesDisabled=!input.enabled;
      if(input.action==='capability')updated.allCapabilitiesDisabled=false;
      if(input.action==='active') {updated.active=input.enabled;updated.validAfter=Math.max(raw.validAfter||0,Math.floor(now()/1000));}
      updated.capabilities=effectiveAdminCapabilities(updated);
      const result={state:'committed',uid,version:updated.accessVersion};
      tx.set(path,updated);
      if(input.action==='active')tx.update(identityRef,{active:input.enabled});
      tx.create(operationRef,{actorUid:claims.uid,actorStaffId:actor.staffId,fingerprint,result,createdAt:now(),
        targetUid:uid,action:input.action,enabled:input.enabled,...(input.capability?{capability:input.capability}:{})});
      // This is Staff governance evidence, not a business-domain state change.
      return result;
    });
  }
  async function reconcile(claims,operationId) {
    identifier(operationId);return db.runTransaction(async tx=>{
      await owner(tx,claims);const receipt=(await tx.get(ref(`staffAccessOperations/${operationId}`))).data();
      return receipt?.actorUid===claims.uid?receipt.result:{state:'unknown'};
    });
  }
  return {list,change,reconcile};
}
