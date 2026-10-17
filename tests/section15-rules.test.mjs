import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,deleteDoc,updateDoc,writeBatch,serverTimestamp,limit,query} from 'firebase/firestore';
let environment;
const namespaces=['communicationPlans','communicationIntents','communicationOperations','communicationDeliveryIssues','communicationTestSends','notificationStates','staffCommunicationPreferences','taxonomyOperations','taxonomyLabelClaims'];
before(async()=>{environment=await initializeTestEnvironment({projectId:'demo-udc-s15-rules',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('firestore.rules','utf8')}});await environment.clearFirestore();await environment.withSecurityRulesDisabled(async context=>{for(const namespace of namespaces)await setDoc(doc(context.firestore(),namespace,'private'),{recipientKey:'customer:protected',private:'Do not disclose'});});});
after(async()=>environment?.cleanup());
test('S15 Customer/Staff/legacy/guest cannot bypass trusted APIs for private communication, counts or write authority',async()=>{
  for(const uid of [null,'customer','staff','legacy']){
    const context=uid?environment.authenticatedContext(uid):environment.unauthenticatedContext();
    for(const namespace of namespaces){await assertFails(getDoc(doc(context.firestore(),namespace,'private')));await assertFails(getDocs(query(collection(context.firestore(),namespace),limit(5))));await assertFails(setDoc(doc(context.firestore(),namespace,'forged'),{state:'AVAILABLE',recipientKey:'customer:protected'}));}
  }
});

test('S15 taxonomy retirement/uniqueness cannot be bypassed by direct client writes; protected history is not public', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'taxonomy', 'public-definition'), { name: 'Public Occasion', dimension: 'occasion', active: true, _version: 1 });
    await setDoc(doc(context.firestore(), 'taxonomy', 'public-definition', 'history', 'private'), { actor: 'protected', version: 1 });
    await setDoc(doc(context.firestore(), 'admins', 'taxonomy-staff'), { active: true, staffId: 'taxonomy-staff-id', capabilities: { 'content.edit': { domainWide: { active: true, purpose: 'content' } } } });
    await setDoc(doc(context.firestore(), 'staffIdentities', 'taxonomy-staff-id'), { active: true, principalUid: 'taxonomy-staff' });
  });
  const staff = environment.authenticatedContext('taxonomy-staff').firestore(), guest = environment.unauthenticatedContext().firestore();
  await getDoc(doc(guest, 'taxonomy', 'public-definition'));
  await assertFails(getDoc(doc(guest, 'taxonomy', 'public-definition', 'history', 'private')));
  await assertFails(getDoc(doc(staff, 'taxonomy', 'public-definition', 'history', 'private')));
  await assertFails(setDoc(doc(staff, 'taxonomy', 'public-definition'), { name: 'Forged active label', dimension: 'occasion', active: false, _version: 2 }));
});

async function contentFixture(id) {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'admins', 'content-staff'), { active: true, staffId: 'content-staff-id', capabilities: Object.fromEntries([['content.read','content'],['content.edit','content'],['content.publish','content'],['operations.reconcile','operation-result']].map(([key,purpose]) => [key,{domainWide:{active:true,purpose}}])) });
    await setDoc(doc(db, 'staffIdentities', 'content-staff-id'), { active: true, principalUid: 'content-staff' });
    await setDoc(doc(db, 'heroSlides', id), { _version: 1, published: false, headline: 'Existing Draft', concept: 'ready-to-wear' });
  });
  const db = environment.authenticatedContext('content-staff').firestore();
  const save = (operation, version, extra = {}) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'heroSlides', id), { headline: 'Current version', _version: version, _lastOperationId: operation, updatedAt: serverTimestamp(), ...extra });
    batch.set(doc(db, 'staffAudit', operation), { actorUid: 'content-staff', actorStaffId: 'content-staff-id', execution: 'staff', targetCollection: 'heroSlides', targetId: id, action: 'save', outcome: 'committed', createdAt: serverTimestamp() });
    return batch.commit();
  };
  return { db, save };
}
test('S15 current Content writes require atomic evidence and reject concurrent/stale versions at Rules boundary', async () => {
  const { db, save } = await contentFixture('versioned-content');
  await assertFails(updateDoc(doc(db, 'heroSlides', 'versioned-content'), { headline: 'Unaudited' }));
  const results = await Promise.allSettled([save('content-race-a', 2), save('content-race-b', 2)]);
  if (results.filter(row => row.status === 'fulfilled').length !== 1) throw Error('Expected exactly one current Content version');
  await assertFails(save('content-stale', 2));
  await assertSucceeds(save('content-current', 3));
});
test('S15 generic Content edit permission does not grant publication', async () => {
  const { save } = await contentFixture('publisher-gate');
  await environment.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'admins', 'content-staff'), { capabilities: Object.fromEntries([['content.read','content'],['content.edit','content'],['operations.reconcile','operation-result']].map(([key,purpose]) => [key,{domainWide:{active:true,purpose}}])) }));
  await assertFails(save('unauthorized-publication', 2, { published: true }));
});
test('S15 revoked Content capability defeats stale tabs and retained evidence cannot mutate history', async () => {
  const { db, save } = await contentFixture('revoked-content');
  await assertSucceeds(save('before-content-revocation', 2));
  await environment.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'admins', 'content-staff'), { capabilities: {} }));
  await assertFails(save('after-content-revocation', 3));
  await assertFails(updateDoc(doc(db, 'staffAudit', 'before-content-revocation'), { actorStaffId: 'new-actor' }));
});

test('S15 explicit current Content publisher can commit one coherent public change', async () => {
  const { save } = await contentFixture('authorized-publisher');
  await assertSucceeds(save('authorized-content-publication', 2, { published: true }));
});

test('S15 Appearance saves use current versions and audit; Reset cannot destroy the source/history', async () => {
  await contentFixture('appearance-permission');
  await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(),'siteAppearance','auth'),{eyebrow:'Current',headline:'Current hero',supportingText:'Current support',image:null,_version:1}));
  const db=environment.authenticatedContext('content-staff').firestore();
  const save=(operation,version)=>{const batch=writeBatch(db);batch.update(doc(db,'siteAppearance','auth'),{headline:'Governed change',_version:version,_lastOperationId:operation,updatedAt:serverTimestamp()});batch.set(doc(db,'staffAudit',operation),{actorUid:'content-staff',actorStaffId:'content-staff-id',execution:'staff',targetCollection:'siteAppearance',targetId:'auth',action:'save',outcome:'committed',createdAt:serverTimestamp()});return batch.commit();};
  await assertFails(updateDoc(doc(db,'siteAppearance','auth'),{headline:'Unaudited overwrite'}));
  await assertSucceeds(save('appearance-save',2)); await assertFails(save('appearance-stale',2));
  await assertFails(deleteDoc(doc(db,'siteAppearance','auth')));
});
