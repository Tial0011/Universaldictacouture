import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createAccountService } from "../netlify/lib/account-service.js";
import { createIdentityResolution } from "../netlify/lib/identity-resolution.js";
import { createAccountProofs } from "../netlify/lib/account-proofs.js";
import { createAccountHandler } from "../netlify/lib/account-handler.js";
import { createAccountSessions } from "../netlify/lib/account-sessions.js";
import { completeStaffRoute } from "../netlify/lib/staff-authority.js";
import { emailKey } from "../netlify/lib/account-contract.js";
const project = "demo-udc-section12", password = "Section16-Local-Only!", secret = "local-emulator-only-identity-key-not-production";
let app, auth, db, service, identity, currentTime, a, b;
const id = () => randomUUID();
async function register(name) {
  const email = name + '-' + id() + '@example.test', operationId = id();
  await service.register({ email, password, operationId });
  const provider = await auth.getUserByEmail(email);
  const claims = { uid: provider.uid, auth_time: Math.floor(currentTime / 1000), email };
  const deliveries = [], proofService = createAccountProofs(service, { origin: 'http://127.0.0.1:5182', deliverProof: async message => deliveries.push(message) });
  await proofService.issueVerification(claims, {});
  await proofService.consume({ token: new URL(deliveries[0].url).searchParams.get('oobCode'), purpose: 'verify', operationId: id() }, claims);
  return { email, operationId, claims, account: await service.context(claims) };
}
before(async () => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'; process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8089';
  app = initializeApp({ projectId: project }, 'section16-test-' + id()); auth = getAuth(app); db = getFirestore(app);
  currentTime = Date.now(); service = createAccountService({ auth, db, secret, now: () => currentTime }); identity = createIdentityResolution(service);
  a = await register('customer-a'); b = await register('customer-b');
});
after(async () => { await db?.terminate(); await deleteApp(app); });

test('F01/F02 registration reservations converge to one random durable identity and binding', async () => {
  await Promise.all([service.register({ email: a.email, password, operationId: a.operationId }), service.register({ email: a.email, password, operationId: a.operationId })]);
  assert.notEqual(a.account.accountId, a.claims.uid); assert.equal((await service.context(a.claims)).accountId, a.account.accountId);
  const otherIntent = id(); await service.register({ email: a.email, password, operationId: otherIntent });
  assert.equal((await service.context(a.claims)).accountId, a.account.accountId);
  await assert.rejects(service.context({ uid: 'unbound', auth_time: a.claims.auth_time }), { code: 'account-binding-required' });
  await assert.rejects(service.register({ email: a.email, password, operationId: a.operationId, role: 'Admin' }), { code: 'invalid-argument' });
});
test('F06 current Profile allowlist, version conflict and operation correlation preserve history', async () => {
  const historical = db.doc('orders/unchanged-' + id()); await historical.set({ accountId: a.account.accountId, recipient: 'Captured Before Edit' });
  const current = await service.readProfile(a.claims), operationId = id();
  const input = { operationId, expectedVersion: current.version, expectedEpoch: current.epoch, fields: { fullName: '<PRIVATE>', phoneNumber: '+234', publicDisplayName: 'Public' } };
  await service.saveProfile(a.claims, input); await service.saveProfile(a.claims, input);
  assert.equal((await service.readProfile(a.claims)).version, current.version + 1);
  assert.equal((await historical.get()).data().recipient, 'Captured Before Edit');
  await assert.rejects(service.saveProfile(a.claims, { ...input, operationId: id() }), { code: 'stale-conflict' });
  await assert.rejects(service.saveProfile(b.claims, input), { code: 'operation-conflict' });
  await assert.rejects(service.saveProfile(a.claims, { ...input, fields: { lifecycle: 'ACTIVE' } }), { code: 'invalid-argument' });
  assert.equal((await service.readProfile(b.claims)).fullName, '');
  assert.equal((await service.reconcile(a.claims, operationId)).state, 'committed');
  assert.equal((await service.reconcile(b.claims, operationId)).state, 'unknown');
});
test('F06 default-address race has one truth and stale save cannot resurrect deletion', async () => {
  const fields = { label: 'Home', recipientName: 'Fixture', recipientPhone: '+234', fullAddress: 'Local emulator address' };
  let book = await service.addresses(a.claims);
  const first = await service.addressMutation(a.claims, { operationId: id(), expectedVersion: book.version, expectedEpoch: book.epoch, action: 'create', fields });
  const second = await service.addressMutation(a.claims, { operationId: id(), expectedVersion: first.version, expectedEpoch: book.epoch, action: 'create', fields: { ...fields, label: 'Work' } });
  const results = await Promise.allSettled([first, second].map(address => service.addressMutation(a.claims, { operationId: id(), expectedVersion: second.version, expectedEpoch: book.epoch, action: 'default', addressId: address.addressId })));
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  book = await service.addresses(a.claims); assert.ok(book.records.some(row => row.id === book.defaultId));
  const deleted = await service.addressMutation(a.claims, { operationId: id(), expectedVersion: book.version, expectedEpoch: book.epoch, action: 'delete', addressId: first.addressId });
  await assert.rejects(service.addressMutation(a.claims, { operationId: id(), expectedVersion: deleted.version, expectedEpoch: book.epoch, action: 'edit', addressId: first.addressId, fields }), { code: 'stale-conflict' });
  assert.equal((await service.addresses(a.claims)).defaultId, second.addressId);
  await assert.rejects(service.addressMutation(b.claims, { operationId: id(), expectedVersion: 1, expectedEpoch: b.account.epoch, action: 'default', addressId: second.addressId }), { code: 'stale-conflict' });
});
test('F07 preference effects converge, protected history is separate and hidden fields are rejected', async () => {
  const current = await service.readPreferences(a.claims), input = { operationId: id(), expectedVersion: current.version, expectedEpoch: current.epoch, fields: { styleCircle: true, preset: 'Balanced' } };
  await service.savePreferences(a.claims, input); await service.savePreferences(a.claims, input);
  assert.equal(await service.optionalCommunicationEligible(a.account.accountId, 'styleCircle'), true);
  assert.equal((await db.doc('accountConsentEvidence/' + input.operationId).get()).data().actorUid, a.claims.uid);
  await assert.rejects(service.savePreferences(a.claims, { ...input, operationId: id(), fields: { sms: true } }), { code: 'invalid-argument' });
});
test('F08 My Information excludes notes/secrets and represents absent external domains independently', async () => {
  await db.doc('customerProfiles/' + b.account.accountId).update({ staffNotes: 'NEVER-DISCLOSE', securitySecret: 'NEVER-DISCLOSE' });
  const info = await service.myInformation(b.claims);
  assert.equal(info.groups.length, 3); assert.equal(info.complete, false); assert.equal(info.externalGroups[0].state, 'unavailable');
  assert.ok(!JSON.stringify(info).includes('NEVER-DISCLOSE'));
  await db.doc('accountPreferences/' + b.account.accountId).delete();
  assert.equal((await service.myInformation(b.claims)).groups.find(group => group.name === 'Communications').state, 'unavailable');
  assert.equal((await service.myInformation(b.claims)).groups[0].state, 'loaded');
});
test('F04 proof purpose, wrong account, supersession and consumption are enforced durably', async () => {
  const deliveries = [], proofs = createAccountProofs(service, { origin: 'http://127.0.0.1:5182', deliverProof: async message => deliveries.push(message) });
  await proofs.issueVerification(a.claims, {}); const oldToken = new URL(deliveries.at(-1).url).searchParams.get('oobCode');
  await proofs.issueVerification(a.claims, {}); const token = new URL(deliveries.at(-1).url).searchParams.get('oobCode');
  assert.equal((await proofs.inspect({ token: oldToken, purpose: 'verify' })).state, 'superseded');
  assert.equal((await proofs.inspect({ token, purpose: 'reset' })).state, 'malformed');
  assert.equal((await proofs.inspect({ token, purpose: 'verify' }, b.claims)).state, 'identity-conflict');
  const committed = await proofs.consume({ token, purpose: 'verify', operationId: id() }, a.claims);
  assert.equal(committed.accountAccessAuthorized, false); assert.equal((await proofs.inspect({ token, purpose: 'verify' })).state, 'consumed');
  await assert.rejects(proofs.consume({ token, purpose: 'verify', operationId: id() }, a.claims), { code: 'proof-consumed' });
  await assert.rejects(proofs.inspect({ token: 'malformed', purpose: 'reset' }), { code: 'proof-malformed' });
});
test('F10/F13 deletion ends access before propagation; tombstone minimal; business history survives', async () => {
  const person = await register('delete-fixture'), operationId = id();
  await service.deletion(person.claims, { operationId, expectedVersion: 1, expectedEpoch: person.account.epoch, confirmation: 'DELETE ACCOUNT' });
  await assert.rejects(service.readProfile(person.claims), { code: 'account-deleted' });
  assert.equal((await service.reconcile(person.claims, operationId)).lifecycle, 'DELETED-CUSTOMER REQUESTED');
  const tombstone = (await db.doc('accountTombstones/' + person.account.accountId).get()).data();
  assert.ok(!Object.keys(tombstone).some(key => /name|email|phone|address/i.test(key)));
  assert.equal(await service.optionalCommunicationEligible(person.account.accountId, 'styleCircle'), false);
  await service.reconcileLifecycle(operationId); await service.reconcileLifecycle(operationId);
  assert.equal((await db.doc('accountLifecycleProjection/' + person.account.accountId).get()).data().optionalEligible, false);
});
async function reviewer(caseId, accountId = null) {
  const uid = id(), staffId = id(), capabilities = {};
  for (const action of ['restore', 'allow-new', 'restrict-registration', 'rare-merge']) capabilities['identity.' + action] = { governance: { active: true, purpose: 'identity-resolution', area: 'identity-resolution', ids: [caseId] } };
  if (accountId) for (const action of ['restrict', 'delete-admin']) capabilities['accounts.' + action] = { governance: { active: true, purpose: 'account-lifecycle', area: 'account-lifecycle', ids: [accountId] } };
  await db.doc('admins/' + uid).set({ active: true, staffId, capabilities });
  await db.doc('staffIdentities/' + staffId).set({ active: true, staffId, principalUid: uid });
  return { uid, auth_time: Math.floor(currentTime / 1000) };
}
async function conflict(original, { samePrincipal = false } = {}) {
  const caseId = id(), uid = samePrincipal ? original.claims.uid : id();
  if (!samePrincipal) await auth.createUser({ uid, email: 'candidate-' + id() + '@example.test', password, emailVerified: true });
  const source = (await db.doc('accounts/' + original.account.accountId).get()).data();
  await db.doc('identityConflicts/' + caseId).set({ caseId, prospectiveUid: uid, loginKey: emailKey(original.email, secret), originalAccountId: source.accountId, originalVersion: source.version, state: 'open', version: 1 });
  return { caseId, uid, staff: await reviewer(caseId, source.accountId) };
}
test('F09 revoked/restricted access defeats stale operations; current Staff capability is rechecked', async () => {
  const person = await register('restrict-fixture'), review = await conflict(person);
  await service.lifecycle(review.staff, { operationId: id(), accountId: person.account.accountId, expectedVersion: 1, action: 'restrict', reason: 'Synthetic current-access test' });
  await assert.rejects(service.readProfile(person.claims), { code: 'account-restricted' });
  await db.doc('admins/' + review.staff.uid).update({ capabilities: {} });
  await assert.rejects(service.lifecycle(review.staff, { operationId: id(), accountId: person.account.accountId, expectedVersion: 2, action: 'delete-admin', reason: 'Must deny revoked capability' }), { code: 'permission-denied' });
  assert.equal((await db.doc('accounts/' + person.account.accountId).get()).data().lifecycle, 'RESTRICTED');
});
test('F11 conflict intake is hidden and does not resolve from email equality', async () => {
  const person = await register('conflict-fixture');
  await service.deletion(person.claims, { operationId: id(), expectedVersion: 1, expectedEpoch: person.account.epoch, confirmation: 'DELETE ACCOUNT' });
  const result = await identity.intake(person.claims, { operationId: id() });
  assert.deepEqual(result, { state: 'assistance-required' });
  assert.equal((await db.doc('accounts/' + person.account.accountId).get()).data().lifecycle, 'DELETED-CUSTOMER REQUESTED');
});
test('F12 Restore keeps original identity, invalidates old session/consent and does not revive old pending writes', async () => {
  const person = await register('restore-fixture');
  await service.savePreferences(person.claims, { operationId: id(), expectedVersion: 1, expectedEpoch: 1, fields: { styleCircle: true } });
  const deleteId = id(); await service.deletion(person.claims, { operationId: deleteId, expectedVersion: 1, expectedEpoch: 1, confirmation: 'DELETE ACCOUNT' });
  const review = await conflict(person, { samePrincipal: true }), operationId = id();
  const input = { operationId, caseId: review.caseId, expectedVersion: 1, outcome: 'RESTORE ORIGINAL ACCOUNT', reason: 'Reviewed synthetic original identity' };
  await identity.resolve(review.staff, input); await identity.resolve(review.staff, input);
  const account = (await db.doc('accounts/' + person.account.accountId).get()).data(); assert.equal(account.lifecycle, 'RESTORED');
  await assert.rejects(service.readProfile(person.claims), { code: 'session-revoked' });
  const fresh = { ...person.claims, auth_time: Math.floor(currentTime / 1000) + 1 };
  assert.equal((await service.context(fresh)).accountId, person.account.accountId);
  assert.equal((await service.readPreferences(fresh)).styleCircle, false);
  await assert.rejects(service.saveProfile(fresh, { operationId: id(), expectedVersion: 1, expectedEpoch: 1, fields: { fullName: 'Old unsent', phoneNumber: '+234' } }), { code: 'stale-authority' });
  await service.reconcileLifecycle(deleteId); // late deletion event cannot overwrite current Restore
  assert.equal((await db.doc('accountLifecycleProjection/' + account.accountId).get()).data().epoch, account.epoch);
});
test('F12 Allow New creates independent identity; two reviewers cannot choose incompatible outcomes', async () => {
  const person = await register('allow-new-fixture'); await service.deletion(person.claims, { operationId: id(), expectedVersion: 1, expectedEpoch: 1, confirmation: 'DELETE ACCOUNT' });
  const review = await conflict(person), input = { caseId: review.caseId, expectedVersion: 1, reason: 'Synthetic review' };
  const results = await Promise.allSettled([identity.resolve(review.staff, { ...input, operationId: id(), outcome: 'ALLOW NEW ACCOUNT AFTER REVIEW' }), identity.resolve(review.staff, { ...input, operationId: id(), outcome: 'RESTORE ORIGINAL ACCOUNT' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const chosen = (await db.doc('identityConflicts/' + review.caseId).get()).data().outcome;
  const binding = (await db.doc('accountBindings/' + review.uid).get()).data();
  if (chosen === 'ALLOW NEW ACCOUNT AFTER REVIEW') assert.notEqual(binding.accountId, person.account.accountId);
  assert.equal((await db.doc('accountPreferences/' + binding.accountId).get()).data().styleCircle, false);
  // The original protected Tombstone remains; no commercial collection is rewritten.
  assert.equal((await db.doc('accountTombstones/' + person.account.accountId).get()).exists, true);
});
test('F12 Restrict Registration is not Account.RESTRICTED; Rare Merge preserves source history and does not union consent', async () => {
  const original = await register('merge-source'), target = await register('merge-target');
  await service.savePreferences(original.claims, { operationId: id(), expectedVersion: 1, expectedEpoch: 1, fields: { styleCircle: true } });
  const restricted = await conflict(original);
  await identity.resolve(restricted.staff, { caseId: restricted.caseId, operationId: id(), expectedVersion: 1, outcome: 'RESTRICT REGISTRATION', reason: 'Synthetic registration review' });
  assert.equal((await db.doc('accounts/' + original.account.accountId).get()).data().lifecycle, 'ACTIVE');
  // A separate reviewed case is required; no redecision of the resolved case.
  const merge = await conflict(original), historical = db.doc('orders/merge-history-' + id()); await historical.set({ accountId: original.account.accountId });
  await assert.rejects(identity.resolve(merge.staff, { caseId: merge.caseId, operationId: id(), expectedVersion: 1, canonicalAccountId: target.account.accountId, outcome: 'RARE MERGE', reason: 'Must independently authorize canonical target' }), { code: 'permission-denied' });
  const membership = (await db.doc('admins/' + merge.staff.uid).get()).data();
  membership.capabilities['identity.rare-merge'].governance.ids.push(target.account.accountId);
  await db.doc('admins/' + merge.staff.uid).set(membership);
  await identity.resolve(merge.staff, { caseId: merge.caseId, operationId: id(), expectedVersion: 1, canonicalAccountId: target.account.accountId, outcome: 'RARE MERGE', reason: 'Exceptional reviewed synthetic linkage' });
  assert.equal((await historical.get()).data().accountId, original.account.accountId);
  assert.equal((await db.doc('accounts/' + original.account.accountId).get()).data().canonicalAccountId, target.account.accountId);
  assert.equal((await db.doc('accountPreferences/' + target.account.accountId).get()).data().styleCircle, false);
  await assert.rejects(service.readProfile(original.claims), { code: 'permission-denied' });
});
test('M02 complete routes reject privilege splicing, stale freshness and sensitive-data general visibility', () => {
  const claims = { uid: 'staff', auth_time: Math.floor(currentTime / 1000) };
  const staff = { active: true, staffId: 'human-staff', functionAsCouturier: true, eligible: true, available: false, capabilities: { 'payment.proof': { domainWide: { active: true, purpose: 'proof-review' }, dataPurpose: { active: true, purpose: 'wrong-purpose', ids: ['payment'], dataClasses: ['proof'] } } } };
  const requirement = { capability: 'payment.proof', purpose: 'proof-review', objectId: 'payment', dataClass: 'proof', action: 'read', state: 'submitted' };
  assert.equal(completeStaffRoute(staff, requirement, claims, currentTime), false);
  staff.capabilities['payment.proof'].dataPurpose.purpose = 'proof-review'; assert.equal(completeStaffRoute(staff, requirement, claims, currentTime), true);
  assert.equal(completeStaffRoute(staff, { ...requirement, objectId: 'foreign' }, claims, currentTime), false);
  assert.equal(completeStaffRoute(staff, { ...requirement, freshSeconds: 1 }, { ...claims, auth_time: claims.auth_time - 100 }, currentTime), false);
  assert.equal(completeStaffRoute({ ...staff, sharedAccount: true }, requirement, claims, currentTime), false);
});
test('M02 Function OFF ends assignment authority; Availability OFF preserves existing work only', () => {
  const claims = { uid: 'staff', auth_time: Math.floor(currentTime / 1000) }, requirement = { capability: 'orders.edit', purpose: 'service', objectId: 'order', assignedStaffId: 's', action: 'edit', state: 'active' };
  const staff = { active: true, staffId: 's', functionAsCouturier: true, eligible: true, available: false, capabilities: { 'orders.edit': { assignmentDerived: { active: true, purpose: 'service' } } } };
  assert.equal(completeStaffRoute(staff, requirement, claims, currentTime), true);
  for (const patch of [{ functionAsCouturier: false }, { eligible: false }]) assert.equal(completeStaffRoute({ ...staff, ...patch }, requirement, claims, currentTime), false);
  assert.equal(completeStaffRoute(staff, { ...requirement, newWork: true }, claims, currentTime), false);
  assert.equal(completeStaffRoute(staff, { ...requirement, assignedStaffId: 'new-assignee' }, claims, currentTime), false);
});
test('F03 ending one managed session rejects old-token replacement without revoking another active device', async()=>{
  const person=await register('session-fixture'), manager=createAccountSessions(service,{origin:'http://127.0.0.1:5182'});
  const first=await manager.start(new Request('http://127.0.0.1:5182'),person.claims,{kind:'customer',keepSignedIn:false,label:'Device A'});
  const second=await manager.start(new Request('http://127.0.0.1:5182'),person.claims,{kind:'customer',keepSignedIn:true,label:'Device B'});
  const requestA=new Request('http://127.0.0.1:5182',{headers:{Cookie:first.cookie.split(';')[0]}}),requestB=new Request('http://127.0.0.1:5182',{headers:{Cookie:second.cookie.split(';')[0]}});
  await manager.end(requestA,person.claims,{kind:'customer'});
  await assert.rejects(manager.validate(requestA,person.claims,'customer'),{code:'session-required'});
  await assert.rejects(manager.start(new Request('http://127.0.0.1:5182'),person.claims,{kind:'customer',keepSignedIn:false,label:'Old proof'}),{code:'fresh-auth-required'});
  assert.equal((await manager.validate(requestB,person.claims,'customer')).uid,person.claims.uid);
});
test('F03 global revocation rejects old auth proof; fresh auth cannot replay an old-epoch write',async()=>{
  const person=await register('global-revoke');
  await service.revokeSessions(person.claims,{operationId:id(),expectedEpoch:1,expectedVersion:1});
  await assert.rejects(service.readProfile(person.claims),{code:'session-revoked'});
  const fresh={...person.claims,auth_time:person.claims.auth_time+1};
  assert.equal((await service.context(fresh)).epoch,2);
  await assert.rejects(service.saveProfile(fresh,{operationId:id(),expectedEpoch:1,expectedVersion:1,fields:{fullName:'Stale',phoneNumber:'+234'}}),{code:'stale-authority'});
});
test('F05 guest handoff rejects negative/private state and waits for the actual saved-relationship owner',async()=>{
  await assert.rejects(service.importGuestIntent(a.claims,{operationId:id(),expectedEpoch:1,intent:{kind:'saved-piece',objectId:'public-piece',positive:true,address:'PRIVATE'}}),{code:'invalid-argument'});
  await assert.rejects(service.importGuestIntent(a.claims,{operationId:id(),expectedEpoch:1,intent:{kind:'saved-piece',objectId:'public-piece',positive:false}}),{code:'invalid-argument'});
  await assert.rejects(service.importGuestIntent(a.claims,{operationId:id(),expectedEpoch:1,intent:{kind:'saved-piece',objectId:'public-piece',positive:true}}),{code:'owner-source-unavailable'});
});
test('F04 unknown credential acknowledgement reconciles through actual provider state, without a second credential write',async()=>{
  const person=await register('unknown-password'),deliveries=[];let updates=0;
  const adapter={getUser:uid=>auth.getUser(uid),async updateUser(uid,fields){updates++;await auth.updateUser(uid,fields);throw Error('Synthetic lost acknowledgement after actual provider commit');}};
  const scoped=createAccountService({db,auth:adapter,secret,now:()=>currentTime});
  const proofs=createAccountProofs(scoped,{origin:'http://127.0.0.1:5182',deliverProof:async message=>deliveries.push(message),passwordMatches:async(provider,newPassword)=>{
    const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-test-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:provider.email,password:newPassword,returnSecureToken:true})});return response.ok&&(await response.json()).localId===provider.uid;
  }});
  await proofs.requestRecovery({email:person.email});const token=new URL(deliveries[0].url).searchParams.get('oobCode'),operationId=id(),newPassword=password+'Changed';
  assert.equal((await proofs.consume({token,purpose:'reset',operationId,password:newPassword})).state,'unknown');
  await assert.rejects(proofs.consume({token,purpose:'reset',operationId,password:newPassword}),{code:'outcome-unknown'});
  assert.equal((await proofs.reconcile({token,purpose:'reset',operationId,password:newPassword})).state,'committed');assert.equal(updates,1);
  assert.equal((await proofs.inspect({token,purpose:'reset'})).state,'consumed');
  await assert.rejects(service.readProfile(person.claims),{code:'session-revoked'});
});
test('F04 neutral intake does not look up provider existence, stores no plaintext email, and stale queued requests supersede',async()=>{
  const deliveries=[],proofs=createAccountProofs(service,{origin:'http://127.0.0.1:5182',deliverProof:async message=>deliveries.push(message)});
  const first=id(),latest=id();
  await proofs.queueRecovery({operationId:first,email:a.email});await proofs.queueRecovery({operationId:latest,email:a.email});
  assert.ok(!JSON.stringify((await db.doc('accountRecoveryIntake/'+first).get()).data()).includes(a.email));
  assert.equal((await proofs.processRecoveryIntake(first)).state,'superseded');
  await proofs.processRecoveryIntake(latest);assert.equal(deliveries.length,1);
  await proofs.processRecoveryIntake(latest);assert.equal(deliveries.length,1);
  assert.equal((await db.doc('accountRecoveryIntake/'+latest).get()).data().sealedEmail,null);
});
test('F04 expired proof cannot regain authority; deletion during pending recovery wins before the credential effect',async()=>{
  const person=await register('deleted-recovery'),deliveries=[];let clock=currentTime;
  const scoped=createAccountService({db,auth,secret,now:()=>clock}),proofs=createAccountProofs(scoped,{origin:'http://127.0.0.1:5182',ttlSeconds:60,deliverProof:async message=>deliveries.push(message)});
  await proofs.requestRecovery({email:person.email});const expired=new URL(deliveries.at(-1).url).searchParams.get('oobCode');clock+=61000;
  assert.equal((await proofs.inspect({token:expired,purpose:'reset'})).state,'expired');await assert.rejects(proofs.consume({token:expired,purpose:'reset',operationId:id(),password:password+'New'}),{code:'proof-expired'});
  clock=currentTime;await proofs.requestRecovery({email:person.email});const pending=new URL(deliveries.at(-1).url).searchParams.get('oobCode');
  await service.deletion(person.claims,{operationId:id(),expectedVersion:1,expectedEpoch:1,confirmation:'DELETE ACCOUNT'});
  assert.equal((await proofs.inspect({token:pending,purpose:'reset'})).state,'ineligible');await assert.rejects(proofs.consume({token:pending,purpose:'reset',operationId:id(),password:password+'New'}),{code:'proof-ineligible'});
  assert.equal((await db.doc('accounts/'+person.account.accountId).get()).data().lifecycle,'DELETED-CUSTOMER REQUESTED');
});
test('trusted HTTP handler verifies emulator tokens, rejects cross-origin and never mutates with GET', async () => {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-test-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: a.email, password, returnSecureToken: true }) });
  const token = (await response.json()).idToken; assert.ok(token);
  const handler = createAccountHandler({ db, auth, secret, origin: 'http://127.0.0.1:5182' }, { minimumPublicMs: 0 });
  const started = await handler(new Request('http://127.0.0.1:5182/.netlify/functions/account?action=session-start', { method:'POST', headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({kind:'customer',keepSignedIn:false,label:'Test browser'}) }));
  assert.equal(started.status,200);const cookie=started.headers.get('set-cookie').split(';')[0];
  const good = await handler(new Request('http://127.0.0.1:5182/.netlify/functions/account?action=profile', { headers: { Authorization: 'Bearer ' + token,Cookie:cookie } }));
  assert.equal(good.status, 200); assert.equal((await good.json()).fullName, '<PRIVATE>');
  assert.equal((await handler(new Request('http://127.0.0.1:5182/.netlify/functions/account?action=profile'))).status, 401);
  assert.equal((await handler(new Request('http://127.0.0.1:5182/.netlify/functions/account?action=profile-save', { headers: { Authorization: 'Bearer ' + token } }))).status, 405);
  assert.equal((await handler(new Request('http://127.0.0.1:5182/.netlify/functions/account?action=profile', { headers: { Origin: 'https://foreign.test', Authorization: 'Bearer ' + token } }))).status, 403);
  const ended=await handler(new Request('http://127.0.0.1:5182/.netlify/functions/account?action=session-end',{method:'POST',headers:{Authorization:'Bearer '+token,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({kind:'customer'})}));assert.equal(ended.status,200);
  assert.equal((await handler(new Request('http://127.0.0.1:5182/.netlify/functions/account?action=profile',{headers:{Authorization:'Bearer '+token,Cookie:cookie}}))).status,401,'copied old token/cookie loses authority');
  assert.equal((await handler(new Request('http://127.0.0.1:5182/.netlify/functions/account?action=session-start',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({kind:'customer',keepSignedIn:false,label:'Must not revive'})}))).status,401,'old proof cannot mint a replacement session');
});
