import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountRuntime} from '../netlify/lib/firebase-admin-runtime.js';
import {LIFECYCLES,RESOLUTIONS,profileFields,preferenceFields,activeAccount} from '../netlify/lib/account-contract.js';
import {sealControlValue,openControlValue} from '../netlify/lib/account-secrets.js';
import {completeStaffRoute} from '../netlify/lib/staff-authority.js';
const source=path=>readFileSync(path,'utf8');
test('exact lifecycle/resolution structure has no deactivation, rare-merge lifecycle or role-based identity',()=>{
  assert.deepEqual(LIFECYCLES,['ACTIVE','RESTRICTED','DELETED-CUSTOMER REQUESTED','DELETED-ADMIN ACTION','RESTORED']);assert.equal(RESOLUTIONS.length,4);
  assert.throws(()=>profileFields({email:'not-profile'}),{code:'invalid-argument'});assert.throws(()=>preferenceFields({orders:false}),{code:'invalid-argument'});
});
test('ambiguous provider binding and null/foreign identity cannot proceed; email match is not identity',()=>{
  const a={accountId:'opaque',principalUid:'A',epoch:1,lifecycle:'ACTIVE',validAfter:0},binding={uid:'A',accountId:'opaque',active:true,epoch:1};
  assert.equal(activeAccount(a,{uid:'A',auth_time:1},binding).accountId,'opaque');
  assert.throws(()=>activeAccount(a,{uid:'B',auth_time:1},binding));assert.throws(()=>activeAccount(a,{uid:'A',auth_time:1},{...binding,accountIds:['opaque','foreign']}),{code:'account-binding-ambiguous'});
});
test('runtime cannot use emulator trust against a production project or missing project-scoped credentials',()=>{
  assert.throws(()=>accountRuntime({FIREBASE_PROJECT_ID:'real-project',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8089',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'}),{code:'account-source-unavailable'});
  assert.throws(()=>accountRuntime({FIREBASE_PROJECT_ID:'real-project',FIREBASE_SERVICE_ACCOUNT_JSON:'{}'}),{code:'account-source-unavailable'});
});
test('all six scope families are independent complete routes and no partial data/purpose route splices',()=>{
  const claims={uid:'p',auth_time:1000},now=1000000;
  const cases=[['domainWide',{},{}],['selectedObject',{ids:['obj']},{objectId:'obj'}],['assignmentDerived',{}, {objectId:'obj',assignedStaffId:'s'}],['queueSubset',{queueIds:['q']},{queueId:'q',queueEligible:true}],['dataPurpose',{ids:['obj'],dataClasses:['proof']},{objectId:'obj',dataClass:'proof'}],['governance',{area:'identity',ids:['obj']},{objectId:'obj',governanceArea:'identity'}]];
  for(const[family,fields,context]of cases){const staff={active:true,staffId:'s',functionAsCouturier:true,eligible:true,available:false,capabilities:{'owner.action':{[family]:{active:true,purpose:'trusted',...fields}}}};assert.equal(completeStaffRoute(staff,{capability:'owner.action',purpose:'trusted',action:'read',state:'current',...context},claims,now),true,family);assert.equal(completeStaffRoute(staff,{capability:'owner.action',purpose:'other',action:'read',...context},claims,now),false,family);}
});
test('recovery intake PII is sealed and tampered ciphertext cannot be silently treated as authority',()=>{
  const secret='emulator-only-key-with-at-least-thirty-two-characters',value=sealControlValue('private@example.test',secret);assert.ok(!JSON.stringify(value).includes('private@example.test'));assert.equal(openControlValue(value,secret),'private@example.test');assert.throws(()=>openControlValue({...value,tag:Buffer.alloc(16).toString('base64')},secret));
});
test('backend is separate from the client and no ordinary request payload mints membership or system actor',()=>{
  assert.ok(!source('src/services/accountApi.js').includes('firebase-admin'));assert.match(source('netlify/lib/account-handler.js'),/verifyIdToken\(token/);
  assert.ok(!source('netlify/lib/account-handler.js').includes('claims = input'));assert.ok(!source('netlify/lib/account-service.js').includes('tx.update(ref(`orders/'));
  assert.match(source('scripts/provision-section16.mjs'),/UDC_PROVISION_APPROVAL_SHA256/);assert.match(source('scripts/provision-section16.mjs'),/if \(!commit\) return/);
});
