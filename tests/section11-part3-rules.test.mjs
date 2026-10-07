import {before,beforeEach,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,getDocs,collection,query,limit} from 'firebase/firestore';
import {studioStaff,route,legacyDevelopmentAdmin} from './staff-fixtures.mjs';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-udc-section11-hardening',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('firestore.rules','utf8')}});});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();await setDoc(doc(db,'admins/studio'),studioStaff());await setDoc(doc(db,'admins/title-only'),{active:true,staffId:'titled',role:'Super Admin',capabilities:{}});await setDoc(doc(db,'admins/legacy'),legacyDevelopmentAdmin());await setDoc(doc(db,'admins/assigned'),{active:true,staffId:'assigned',capabilities:{'chats.read':{assignmentDerived:{active:true,purpose:'customer-service'}}}});
  await setDoc(doc(db,'admins/auditor'),{active:true,staffId:'auditor',capabilities:{'audit.read':route('audit')}});
  for(const uid of ['A','B']){await setDoc(doc(db,'customerProfiles',uid),{fullName:'PRIVATE-'+uid,phoneNumber:'PRIVATE',lifecycle:'ACTIVE'});await setDoc(doc(db,'savedPieces',uid),{productIds:['private']});}
  for(const id of ['own','foreign']){await setDoc(doc(db,'conversations',id),{customerId:id,assignedStaffId:id==='own'?'assigned':'other'});await setDoc(doc(db,'conversations',id,'messages','m'),{body:'PRIVATE',senderId:id});}
  await setDoc(doc(db,'orders/historical'),{ownerId:'A',recipientName:'CAPTURED-NAME',deliverySnapshot:{address:'CAPTURED-ADDRESS'}});await setDoc(doc(db,'payments/evidence'),{ownerId:'A',proof:'PRIVATE-PROOF'});await setDoc(doc(db,'staffAudit/history'),{actorUid:'studio',actorStaffId:'staff-studio',targetCollection:'orders',targetId:'historical',outcome:'committed'});
});});
after(async()=>{await env?.cleanup();});
const client=uid=>env.authenticatedContext(uid,{email:uid+'@example.test'}).firestore();
test('own/foreign legacy Profile and guessed address-child routes remain closed until the actual owner service exists',async()=>{
  for(const uid of ['A','B','studio','title-only','legacy','assigned']){const db=client(uid);for(const path of ['customerProfiles/A','customerProfiles/B','customerProfiles/A/addresses/foreign','customerProfiles/B/addresses/own'])await assertFails(getDoc(doc(db,path)));await assertFails(getDocs(query(collection(db,'customerProfiles'),limit(20))));}
});
test('mass assignment, self-membership and lifecycle shortcuts cannot commit through customer or Staff direct writes',async()=>{
  for(const uid of ['A','studio','title-only','legacy']){const db=client(uid);await assertFails(setDoc(doc(db,'admins',uid),studioStaff()));await assertFails(updateDoc(doc(db,'customerProfiles/A'),{roles:['Super Admin'],ownerId:uid,lifecycle:'RESTORED',verified:true}));await assertFails(updateDoc(doc(db,'orders/historical'),{recipientName:'CURRENT-PROFILE'}));await assertFails(updateDoc(doc(db,'payments/evidence'),{proof:'REWRITTEN'}));}
  await env.withSecurityRulesDisabled(async c=>{assert.equal((await getDoc(doc(c.firestore(),'orders/historical'))).data().recipientName,'CAPTURED-NAME');});
});
test('assigned Chat access does not authorize foreign parent/child paths or whole Profile; reassignment removes prior access',async()=>{
  const db=client('assigned');await assertSucceeds(getDoc(doc(db,'conversations/own/messages/m')));await assertFails(getDoc(doc(db,'conversations/foreign/messages/m')));await assertFails(getDoc(doc(db,'customerProfiles/A')));
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'conversations/own'),{assignedStaffId:'other'}));await assertFails(getDoc(doc(db,'conversations/own/messages/m')));
});
test('formal Audit read grants do not unlock related transaction evidence, and historical evidence is immutable',async()=>{
  const db=client('auditor');await assertSucceeds(getDoc(doc(db,'staffAudit/history')));for(const path of ['payments/evidence','orders/historical','customerProfiles/A','conversations/own/messages/m'])await assertFails(getDoc(doc(db,path)));await assertFails(updateDoc(doc(db,'staffAudit/history'),{actorUid:'rewritten'}));
});
