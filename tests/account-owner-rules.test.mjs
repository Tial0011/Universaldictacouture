import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc} from 'firebase/firestore';
import {superAdminCapabilities,OWNER_PROFILE} from '../src/services/superAdminPolicy.js';
let env;
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-udc-owner-repair-rules',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('firestore.rules','utf8')}});
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'admins/owner'),{active:true,staffId:'owner-id',accessProfile:OWNER_PROFILE,validAfter:100,capabilities:superAdminCapabilities({paymentReview:true})});
    await setDoc(doc(db,'staffIdentities/owner-id'),{staffId:'owner-id',principalUid:'owner',active:true});
    await setDoc(doc(db,'staffOwners/owner'),{staffId:'owner-id',principalUid:'owner',active:true});
    await setDoc(doc(db,'products/private'),{name:'Private draft',status:'draft',_version:1});
  });
});
after(async()=>{await env?.cleanup();});
test('even an Owner cannot bypass the trusted governance API or self-promote through Firestore',async()=>{
  for(const uid of ['owner','customer']){
    const db=env.authenticatedContext(uid,{auth_time:200,role:'Owner'}).firestore();
    await assertFails(setDoc(doc(db,'staffOwners/customer'),{active:true,staffId:'invented'}));
    await assertFails(updateDoc(doc(db,'admins/owner'),{capabilities:{}}));
    await assertFails(setDoc(doc(db,'staffAccessOperations/fake'),{state:'committed'}));
    await assertFails(getDoc(doc(db,'staffOwners/owner')));
  }
});
test('suspended/reactivated memberships require a fresh token even at the direct Firestore boundary',async()=>{
  await assertFails(getDoc(doc(env.authenticatedContext('owner',{auth_time:100}).firestore(),'products/private')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('owner',{auth_time:200}).firestore(),'products/private')));
});
