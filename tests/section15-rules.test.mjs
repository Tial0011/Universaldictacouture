import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,limit,query} from 'firebase/firestore';
let environment;
const namespaces=['communicationPlans','communicationIntents','communicationOperations','communicationDeliveryIssues','communicationTestSends','notificationStates','staffCommunicationPreferences'];
before(async()=>{environment=await initializeTestEnvironment({projectId:'demo-udc-s15-rules',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('firestore.rules','utf8')}});await environment.withSecurityRulesDisabled(async context=>{for(const namespace of namespaces)await setDoc(doc(context.firestore(),namespace,'private'),{recipientKey:'customer:protected',private:'Do not disclose'});});});
after(async()=>environment?.cleanup());
test('S15 Customer/Staff/legacy/guest cannot bypass trusted APIs for private communication, counts or write authority',async()=>{
  for(const uid of [null,'customer','staff','legacy']){
    const context=uid?environment.authenticatedContext(uid):environment.unauthenticatedContext();
    for(const namespace of namespaces){await assertFails(getDoc(doc(context.firestore(),namespace,'private')));await assertFails(getDocs(query(collection(context.firestore(),namespace),limit(5))));await assertFails(setDoc(doc(context.firestore(),namespace,'forged'),{state:'AVAILABLE',recipientKey:'customer:protected'}));}
  }
});
