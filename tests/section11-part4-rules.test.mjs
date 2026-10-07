import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc} from 'firebase/firestore';
import {studioStaff,legacyDevelopmentAdmin} from './staff-fixtures.mjs';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-udc-section11-final-rules',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();for(const [id,staffId]of [['spaces','  '],['tabs','\t\n']])await setDoc(doc(db,'admins',id),{...studioStaff(),staffId});await setDoc(doc(db,'admins/canonical'),studioStaff());await setDoc(doc(db,'admins/legacy'),legacyDevelopmentAdmin());await setDoc(doc(db,'products/private'),{name:'Private Draft',status:'draft',archived:false,_version:1});await setDoc(doc(db,'customerProfiles/customer'),{fullName:'Private',phoneNumber:'Private',email:'captured@example.test'});});});
after(async()=>{await env?.cleanup();});
test('trusted Rules and frontend agree that whitespace-only canonical Staff Identity is invalid; no legacy fallback',async()=>{
  for(const uid of ['spaces','tabs'])await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(),'products/private')));
});
test('canonical and legitimate legacy development Staff still read permitted workspace data',async()=>{
  for(const uid of ['canonical','legacy'])await assertSucceeds(getDoc(doc(env.authenticatedContext(uid).firestore(),'products/private')));
});
test('obsolete dormant email-in-Personal-Details contract is gone without broadening Customer/Staff access',async()=>{
  for(const uid of ['customer','legacy','canonical']){const db=env.authenticatedContext(uid).firestore();await assertFails(getDoc(doc(db,'customerProfiles/customer')));await assertFails(updateDoc(doc(db,'customerProfiles/customer'),{email:'changed@example.test',roles:['Admin']}));}
  await env.withSecurityRulesDisabled(async c=>assert.equal((await getDoc(doc(c.firestore(),'customerProfiles/customer'))).data().email,'captured@example.test'));
});
