import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,limit,query} from 'firebase/firestore';
let environment;
const targets=['orders/private-order/operationalNotes/private-note','orders/private-order/operationalNotes/private-note/revisions/00000001',
  'orders/private-order/escalations/private-escalation','orders/private-order/escalations/private-escalation/history/00000001'];
before(async()=>{
  environment=await initializeTestEnvironment({projectId:'demo-udc-section14-rules',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('firestore.rules','utf8')}});
  await environment.withSecurityRulesDisabled(async context=>{for(const target of targets)await setDoc(doc(context.firestore(),target),{body:'PRIVATE SOURCE EVIDENCE',revision:1,state:'OPEN'});});
});
after(async()=>environment?.cleanup());
test('S14 notes/escalations/current revisions/history are server-only; role, assignment and guessed IDs grant no client bypass',async()=>{
  for(const uid of [null,'customer','assigned-couturier','super-admin']){
    const db=(uid?environment.authenticatedContext(uid,{role:'Super Admin'}):environment.unauthenticatedContext()).firestore();
    for(const target of targets){await assertFails(getDoc(doc(db,target)));await assertFails(setDoc(doc(db,target),{body:'FORGED',revision:2,state:'RESOLVED'}));}
    for(const target of ['orders/private-order/operationalNotes','orders/private-order/escalations'])await assertFails(getDocs(query(collection(db,target),limit(20))));
  }
});
