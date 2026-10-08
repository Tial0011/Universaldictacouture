import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc } from 'firebase/firestore';
import { studioStaff, legacyDevelopmentAdmin } from './staff-fixtures.mjs';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-udc-section16-rules',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('firestore.rules','utf8')}});});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore(); await setDoc(doc(db,'admins/canonical'),studioStaff());await setDoc(doc(db,'admins/legacy'),legacyDevelopmentAdmin());
  await setDoc(doc(db,'staffIdentities/staff-studio'),{staffId:'staff-studio',principalUid:'canonical',active:true});
  await setDoc(doc(db,'products/private'),{name:'Protected',status:'draft'});
  await setDoc(doc(db,'customerAccess/A'),{accountId:'durable-A',epoch:1,lifecycle:'ACTIVE',available:true});
  await setDoc(doc(db,'sessionAccess/session-A'),{uid:'A',active:true,kind:'customer'});
  for(const namespace of ['accounts','accountBindings','accountLoginClaims','accountRegistrations','accountOperations','accountPreferences','accountTombstones','accountProofs','accountProofOperations','accountRecoveryIntents','accountRecoveryIntake','accountEvidence','accountConsentEvidence','accountSecurityEvidence','accountLifecycleEvents','accountLifecycleProjection','accountRateLimits','identityConflicts','identityLinkage','identityAudit','identityMigrationEvidence','staffHumanBindings','principalSecurity','accountSessions','accountSessionAdmission'])await setDoc(doc(db,namespace,'hidden'),{private:'NOT-DISCLOSED'});
});});
after(async()=>{await env?.cleanup();});
const db=uid=>env.authenticatedContext(uid,{auth_time:100,email:uid+'@example.test'}).firestore();
test('M13-M16 events/jobs/templates/notification renders/projections/Audit remain server-only',async()=>{
  const paths=['ownerEvents/source','downstreamJobs/job','downstreamAttempts/attempt','notificationBindings/render','notificationDelivery/result','formalAudit/evidence','sharedConfiguration/bank-transfer','sharedConfiguration/bank-transfer/versions/1','configurationOperations/receipt','productReadModels/derived'];
  await env.withSecurityRulesDisabled(async c=>{for(const path of paths)await setDoc(doc(c.firestore(),path),{private:'NO DISCLOSURE'});});
  for(const uid of ['A','canonical','legacy'])for(const path of paths){await assertFails(getDoc(doc(db(uid),path)));await assertFails(updateDoc(doc(db(uid),path),{state:'applied'}));}
  for(const namespace of ['ownerEvents','downstreamJobs','notificationBindings','formalAudit','sharedConfiguration','productReadModels'])await assertFails(getDocs(query(collection(env.unauthenticatedContext().firestore(),namespace),limit(10))));
});
test('M07-M12 new owner data, proof decisions, messages and consent cannot bypass managed API sessions',async()=>{
  const paths=['orders/main','orders/main/work/base','orders/main/work/base/editions/1','payments/evidence','paymentIntents/reserved','paymentContributions/derived','paymentDecisions/verified','bankTransferEffects/identity','transactionOperations/result','transactionEvidence/audit','orderOperationalHistory/dispatch','dispatchSnapshots/captured','deliveryProviderEvidence/provider','accountConversations/order:main','accountConversations/order:main/messages/message','accountReviews/review','reviewConsentEvidence/grant','reviewHistory/publication'];
  await env.withSecurityRulesDisabled(async c=>{for(const path of paths)await setDoc(doc(c.firestore(),path),{private:'NO DISCLOSURE'});await setDoc(doc(c.firestore(),'reviewPublicState/visible'),{publicAllowed:true,version:1});await setDoc(doc(c.firestore(),'reviewPublicState/hidden'),{publicAllowed:false,version:2});});
  for(const uid of ['A','canonical','legacy'])for(const path of paths){await assertFails(getDoc(doc(db(uid),path)));await assertFails(updateDoc(doc(db(uid),path),{owner:'forged'}));}
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),'reviewPublicState/visible')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'reviewPublicState/hidden')));
  await assertFails(getDocs(query(collection(env.unauthenticatedContext().firestore(),'reviewPublicState'),limit(20))));
});
test('Customer, canonical Staff and legacy Admin cannot read/list/write trusted identity/evidence/control planes',async()=>{
  for(const uid of ['A','canonical','legacy'])for(const namespace of ['accounts','accountBindings','accountLoginClaims','accountOperations','accountPreferences','accountTombstones','accountProofs','identityConflicts','identityAudit','accountSessions']){
    await assertFails(getDoc(doc(db(uid),namespace,'hidden')));await assertFails(getDocs(query(collection(db(uid),namespace),limit(10))));await assertFails(setDoc(doc(db(uid),namespace,'escalate'),{active:true,role:'Super Admin'}));
  }
});
test('minimal revalidation signals are own-principal-only, immutable and never private data authority',async()=>{
  await assertSucceeds(getDoc(doc(db('A'),'customerAccess/A')));await assertSucceeds(getDoc(doc(db('A'),'sessionAccess/session-A')));
  for(const uid of ['B','legacy','canonical']){await assertFails(getDoc(doc(db(uid),'customerAccess/A')));await assertFails(getDoc(doc(db(uid),'sessionAccess/session-A')));}
  await assertFails(updateDoc(doc(db('A'),'customerAccess/A'),{available:true,epoch:999}));await assertFails(getDoc(doc(db('A'),'customerProfiles/durable-A')));
});
test('offboarding or ambiguous Staff binding defeats stale grants; missing new grants never fall back to role strings',async()=>{
  await assertSucceeds(getDoc(doc(db('canonical'),'products/private')));
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'staffIdentities/staff-studio'),{principalUid:'other'}));
  await assertFails(getDoc(doc(db('canonical'),'products/private')));
  await assertFails(setDoc(doc(db('A'),'admins/A'),studioStaff()));await assertFails(getDocs(query(collection(db('legacy'),'admins'),limit(10))));
});
test('current security cutoff and shared-account rejection apply to Staff reads without granting customer data',async()=>{
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'principalSecurity/canonical'),{validAfter:100}));
  await assertFails(getDoc(doc(db('canonical'),'products/private')));
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'admins/legacy'),{sharedAccount:true}));
  await assertFails(getDoc(doc(db('legacy'),'products/private')));
  await env.withSecurityRulesDisabled(async c=>{assert.equal((await getDoc(doc(c.firestore(),'products/private'))).data().status,'draft');});
});
test('M03-M06 private owner records and working catalogue cannot be read or mutated through client bypasses',async()=>{
  const namespaces=['pretransactionOperations','productHistory','mediaAssets','mediaReferences','customerContinuity','customStyleRequests','customStyleHandoffs'];
  await env.withSecurityRulesDisabled(async c=>{
    for(const name of namespaces) await setDoc(doc(c.firestore(),name,'hidden'),{private:'NEVER'});
    await setDoc(doc(c.firestore(),'products/managed'),{name:'Working',status:'published',_ownerVersion:2,_version:2,publicRepresentation:{name:'Live'},internalNotes:'NEVER'});
  });
  for(const uid of ['A','canonical','legacy'])for(const name of namespaces){await assertFails(getDoc(doc(db(uid),name,'hidden')));await assertFails(getDocs(query(collection(db(uid),name),limit(5))));await assertFails(setDoc(doc(db(uid),name,'escalate'),{accountId:'durable-A'}));}
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'products/managed')));
  await assertFails(getDoc(doc(db('A'),'products/managed')));
  await assertSucceeds(getDoc(doc(db('canonical'),'products/managed')));
  await assertFails(updateDoc(doc(db('canonical'),'products/managed'),{_ownerVersion:0,name:'Downgrade'}));
});
