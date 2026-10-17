import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createAccountService } from '../netlify/lib/account-service.js';
import { createConfigurationService } from '../netlify/lib/shared-configuration.js';
import { createTaxonomyGovernance } from '../netlify/lib/taxonomy-governance.js';
import { createPretransactionService } from '../netlify/lib/pretransaction-service.js';
import { createTransactionService } from '../netlify/lib/transaction-service.js';
import { createConversationReviewService } from '../netlify/lib/transaction-conversation-review.js';
import { createRuntimeIntegrity } from '../netlify/lib/runtime-integrity.js';
import { SUPER_ADMIN_PROFILE } from '../src/services/superAdminPolicy.js';
import { SECTION15_STATES, semanticState, protectedWriteDeadline } from '../src/services/operationalRuntime.js';

const id = () => randomUUID();
let app, db, auth, account, config, taxonomy, cluster, staff, capabilities, clock;
const bankValue = { bankName: 'ISOLATED TEST BANK', accountName: 'Emulator only', accountNumber: '0000000123' };
before(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8089'; process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'; process.env.METADATA_SERVER_DETECTION = 'none';
  app = initializeApp({ projectId: 'demo-udc-s15-integrity-' + id().slice(0, 8) }, 'integrity-' + id()); db = getFirestore(app); auth = getAuth(app); clock = Date.now();
  account = createAccountService({ db, auth, now: () => clock, secret: 'section15-integrity-isolated-emulator-secret' });
  config = createConfigurationService(account); taxonomy = createTaxonomyGovernance(account); cluster = createPretransactionService(account);
  staff = { uid: id(), staffId: id(), kind: 'staff', auth_time: Math.floor(clock / 1000) };
  capabilities = {};
  for (const action of ['read', 'edit']) {
    capabilities['settings.bank.' + action] = { governance: { active: true, purpose: 'financial-settings', area: 'financial-settings', ids: ['bank-transfer'] } };
    capabilities['settings.templates.' + action] = { domainWide: { active: true, purpose: 'communication-settings' } };
    capabilities['settings.taxonomy.' + action] = { domainWide: { active: true, purpose: 'taxonomy-settings' } };
  }
  for (const action of ['create', 'read', 'edit', 'discovery']) capabilities['products.' + action] = { domainWide: { active: true, purpose: 'catalogue' } };
  for (const action of ['read', 'product-draft', 'publish']) capabilities['reviews.' + action] = { domainWide: { active: true, purpose: 'moderation' } };
  await db.doc('staffIdentities/' + staff.staffId).set({ staffId: staff.staffId, principalUid: staff.uid, active: true });
});
beforeEach(async () => {
  await db.doc('admins/' + staff.uid).set({ active: true, staffId: staff.staffId, capabilities });
  await db.doc('staffIdentities/' + staff.staffId).update({ active: true });
});
after(async () => { await db?.terminate(); await deleteApp(app); });
const bankSave = async (override = {}) => config.mutate(staff, { configurationId: 'bank-transfer', action: 'save', expectedVersion: (await config.read(staff, 'bank-transfer')).version, operationId: id(), value: bankValue, ...override });

test('F5.1 complete semantic vocabulary; timeout remains unknown even if late commit occurs', async () => {
  assert.equal(SECTION15_STATES.length, 21); assert.equal(new Set(SECTION15_STATES).size, 21);
  assert.equal(semanticState('checking'), 'LOADING'); assert.equal(semanticState('unavailable'), 'SOURCE UNAVAILABLE'); assert.equal(semanticState('unknown-result'), 'UNKNOWN OUTCOME'); assert.equal(semanticState('propagation-pending'), 'PROPAGATION PENDING');
  let committed = false; const work = new Promise(resolve => setTimeout(() => { committed = true; resolve('committed'); }, 30));
  await assert.rejects(protectedWriteDeadline(work, 2), { code: 'outcome-unknown' }); await work; assert.equal(committed, true);
});
test('J6/J7 one bounded Bank Save is one effective version; duplicate transport converges', async () => {
  const current = await config.read(staff, 'bank-transfer'), operationId = id(), input = { configurationId: 'bank-transfer', action: 'save', expectedVersion: current.version, operationId, value: bankValue };
  const results = await Promise.all([config.mutate(staff, input), config.mutate(staff, input)]); assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].version, current.version + 1); assert.equal(results[0].effectiveVersion, results[0].version); assert.equal(results[0].proposedVersion, null);
  assert.deepEqual((await config.read(staff, 'bank-transfer')).effective.value, bankValue);
  assert.equal((await config.reconcile(staff, operationId)).version, results[0].version);
  const version = (await db.doc('sharedConfiguration/bank-transfer/versions/' + results[0].version).get()).data(); assert.equal(version.createdAt, clock); assert.equal(version.actor.staffId, staff.staffId);
});
test('J6/J7 concurrent Bank editors have one winner and reject stale writes', async () => {
  const current = await config.read(staff, 'bank-transfer');
  const results = await Promise.allSettled([1, 2].map(value => bankSave({ expectedVersion: current.version, value: { ...bankValue, accountName: 'Editor ' + value } })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(results.find(result => result.status === 'rejected').reason.code, 'stale-conflict');
  await assert.rejects(bankSave({ expectedVersion: -1 }), { code: 'invalid-argument' });
});
test('J7 role text/step-up do not grant Bank authority; edit does not grant disclosure', async () => {
  await db.doc('admins/' + staff.uid).set({ active: true, staffId: staff.staffId, role: 'Super Admin', accessProfile: SUPER_ADMIN_PROFILE, capabilities: {} });
  await assert.rejects(config.read(staff, 'bank-transfer'), { code: 'permission-denied' }); await assert.rejects(bankSave(), { code: 'permission-denied' });
  await db.doc('admins/' + staff.uid).update({ capabilities: { 'settings.bank.edit': capabilities['settings.bank.edit'] } });
  await assert.rejects(config.mutate(staff, { configurationId: 'bank-transfer', action: 'save', expectedVersion: 0, operationId: id(), value: bankValue }), { code: 'permission-denied' });
});
test('J7 recent authentication is enforced after explicit capability', async () => {
  await assert.rejects(config.read({ ...staff, auth_time: staff.auth_time - 600 }, 'bank-transfer'), { code: 'fresh-auth-required' });
});
test('J9 capability loss blocks stale Save and receipt disclosure without erasing the receipt', async () => {
  const result = await bankSave(), operations = await db.collection('configurationOperations').where('result.version', '==', result.version).get();
  const receipt = operations.docs.find(row => row.data().result.configurationId === 'bank-transfer');
  await db.doc('admins/' + staff.uid).update({ capabilities: {} });
  await assert.rejects(config.reconcile(staff, receipt.id), { code: 'permission-denied' });
  await assert.rejects(config.mutate(staff, { configurationId: 'bank-transfer', action: 'save', expectedVersion: result.version, operationId: id(), value: bankValue }), { code: 'permission-denied' });
  assert.equal((await receipt.ref.get()).data().state, 'committed');
});
test('J7 Bank history never redisplays protected raw account fields', async () => {
  await bankSave(); const history = await config.history(staff, 'bank-transfer');
  assert.ok(history.records.length); assert.ok(history.records.every(record => record.value === undefined)); assert.ok(!JSON.stringify(history).includes(bankValue.accountNumber));
});
test('F5.1/F5.3 template history remains pageable beyond 100 versions', async () => {
  const key = 'template:s15:customer:information', batch = db.batch();
  for (let version = 1; version <= 125; version++) batch.set(db.doc('sharedConfiguration/' + key + '/versions/' + version), { configurationId: key, version, value: { heading: 'Synthetic history ' + version }, createdAt: clock });
  batch.set(db.doc('sharedConfiguration/' + key), { version: 125, effectiveVersion: 125 });
  batch.set(db.doc('sharedConfiguration/' + key + '/publicationEvidence/old'), { publishedVersion: 5 }); await batch.commit();
  let before = null, seen = []; do { const page = await config.history(staff, key, before); assert.ok(page.records.length <= 20); seen.push(...page.records); before = page.next; } while (before);
  assert.equal(seen.length, 125); assert.equal(new Set(seen.map(row => row.version)).size, 125); assert.equal(seen.find(row => row.version === 5).state, 'SUPERSEDED');
});
test('J8 taxonomy double submit keeps stable identity and one logical history event', async () => {
  const input = { action: 'create', operationId: id(), expectedVersion: 0, name: 'Occasion ' + id(), dimension: 'occasion' };
  const results = await Promise.all([taxonomy.mutate(staff, input), taxonomy.mutate(staff, input)]); assert.deepEqual(results[0], results[1]);
  assert.equal((await db.doc('taxonomy/' + results[0].id).collection('history').get()).size, 1);
  assert.equal((await taxonomy.reconcile(staff, input.operationId)).id, results[0].id);
});
test('J8 concurrent normalized active labels cannot create duplicate definitions', async () => {
  const name = 'Celebration ' + id();
  const results = await Promise.allSettled([name, name.toUpperCase()].map(label => taxonomy.mutate(staff, { action: 'create', operationId: id(), expectedVersion: 0, name: label, dimension: 'style' })));
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1); assert.equal(results.find(row => row.status === 'rejected').reason.code, 'taxonomy-label-conflict');
});
test('J8 rename/deactivate/reactivate preserve ID and leave Product relationships untouched', async () => {
  const result = await taxonomy.mutate(staff, { action: 'create', operationId: id(), expectedVersion: 0, name: 'Fabric ' + id(), dimension: 'fabric' });
  const productId = id(), original = { status: 'published', _version: 1, taxonomyReferences: [{ dimension: 'fabric', definitionId: result.id, capturedLabel: 'Historical label' }] }; await db.doc('products/' + productId).set(original);
  const renamed = await taxonomy.mutate(staff, { action: 'rename', id: result.id, expectedVersion: 1, name: 'Renamed ' + id(), operationId: id() }); assert.equal(renamed.id, result.id);
  const inactive = await taxonomy.mutate(staff, { action: 'deactivate', id: result.id, expectedVersion: 2, operationId: id() }); assert.equal(inactive.active, false);
  assert.deepEqual((await db.doc('products/' + productId).get()).data(), original);
  await assert.rejects(taxonomy.mutate(staff, { action: 'reactivate', id: result.id, expectedVersion: 1, operationId: id() }), { code: 'stale-conflict' });
  assert.equal((await taxonomy.mutate(staff, { action: 'reactivate', id: result.id, expectedVersion: 3, operationId: id() })).id, result.id);
  const reordered = await taxonomy.mutate(staff, { action: 'reorder', id: result.id, expectedVersion: 4, order: 42, operationId: id() }); assert.equal(reordered.id, result.id); assert.equal((await taxonomy.read(staff, result.id)).order, 42);
  await assert.rejects(taxonomy.mutate(staff, { action: 'merge', id: result.id, expectedVersion: 4, operationId: id() }), { code: 'invalid-argument' });
});
test('J8 new assignment checks all dimensions and case variants; retained assignment stays interpretable', async () => {
  const product = await cluster.mutateProduct(staff, { action: 'create', operationId: id(), fields: { name: 'Taxonomy test' } });
  await assert.rejects(cluster.mutateProduct(staff, { action: 'save', operationId: id(), productId: product.productId, expectedVersion: product.version, fields: { occasion: ['Undefined ' + id()] } }), { code: 'taxonomy-unavailable' });
  const name = 'Retired ' + id(); await db.doc('taxonomy/' + id()).set({ dimension: 'fabric', name, active: false });
  for (const fields of [{ fabric: [name] }, { fabric: [name.toUpperCase()] }, { shopBy: { fabric: [name] } }]) await assert.rejects(cluster.mutateProduct(staff, { action: 'save', operationId: id(), productId: product.productId, expectedVersion: product.version, fields }), { code: 'taxonomy-unavailable' });
});
test('J9 revoked taxonomy capability blocks stale-tab mutation and history receipt access', async () => {
  const operationId = id(), result = await taxonomy.mutate(staff, { action: 'create', operationId, expectedVersion: 0, name: 'Revoke ' + id(), dimension: 'occasion' });
  await db.doc('admins/' + staff.uid).update({ capabilities: {} });
  await assert.rejects(taxonomy.mutate(staff, { action: 'deactivate', id: result.id, expectedVersion: 1, operationId: id() }), { code: 'permission-denied' });
  await assert.rejects(taxonomy.reconcile(staff, operationId), { code: 'permission-denied' });
  assert.equal((await db.doc('taxonomy/' + result.id).get()).data().active, true);
});
async function reviewFixture() {
  const accountId = id(), orderId = id(), reviewId = id();
  await db.doc('accounts/' + accountId).set({ accountId, lifecycle: 'ACTIVE' });
  await db.doc('orders/' + orderId).set({ _ownerVersion: 3, orderId, accountId, reviewEnabled: true });
  await db.doc('orders/' + orderId + '/work/base').set({ completed: true });
  const review = { _ownerVersion: 3, reviewId, authorAccountId: accountId, orderId, version: 1, status: 'published', published: true, moderation: 'APPROVED', permissions: { publication: true, productReuse: true, promotion: false }, body: 'Customer testimony stays intact', author: 'Isolated Customer', submittedAt: clock, publishedAt: clock, mediaRefs: ['fixture-media'] };
  await db.doc('accountReviews/' + reviewId).set(review);
  return { accountId, reviewId, review, service: createConversationReviewService(createTransactionService(account)) };
}
test('J4 deletion stops identifying Review/media redisplay; history/testimony stays intact', async () => {
  const fixture = await reviewFixture(); assert.ok((await fixture.service.feed()).records.some(row => row.id === fixture.reviewId));
  await db.doc('accounts/' + fixture.accountId).update({ lifecycle: 'DELETED-CUSTOMER REQUESTED' });
  assert.equal((await fixture.service.feed()).records.some(row => row.id === fixture.reviewId), false);
  assert.equal(await db.runTransaction(tx => fixture.service.publicMedia(tx, { domain: 'review', objectId: fixture.reviewId, referenceId: 'fixture-media', active: true })), false);
  await assert.rejects(fixture.service.reviewToDraft(staff, { reviewId: fixture.reviewId, expectedVersion: 1, operationId: id() }), { code: 'reuse-not-authorized' });
  assert.equal((await db.doc('accountReviews/' + fixture.reviewId).get()).data().body, fixture.review.body);
});
test('J4 independent continued-use policy is current and purpose-specific', async () => {
  const fixture = await reviewFixture(); await db.doc('accounts/' + fixture.accountId).update({ lifecycle: 'DELETED-ADMIN ACTION' });
  const service = createConversationReviewService(createTransactionService(account), { continuedReviewUse: async (_tx, context) => context.purpose === 'publication' });
  assert.ok((await service.feed()).records.some(row => row.id === fixture.reviewId));
  await assert.rejects(service.reviewToDraft(staff, { reviewId: fixture.reviewId, expectedVersion: 1, operationId: id() }), { code: 'reuse-not-authorized' });
});
test('J4 moderation cannot grant Product reuse; duplicate handoff produces one Draft only', async () => {
  const fixture = await reviewFixture(); await db.doc('accountReviews/' + fixture.reviewId).update({ permissions: { publication: true, productReuse: false } });
  await assert.rejects(fixture.service.reviewToDraft(staff, { reviewId: fixture.reviewId, expectedVersion: 1, operationId: id() }), { code: 'reuse-not-authorized' });
  await db.doc('accountReviews/' + fixture.reviewId).update({ permissions: { publication: true, productReuse: true } });
  const input = { reviewId: fixture.reviewId, expectedVersion: 1, operationId: id() }; const results = await Promise.all([fixture.service.reviewToDraft(staff, input), fixture.service.reviewToDraft(staff, input)]); assert.deepEqual(results[0], results[1]);
  assert.equal((await db.doc('products/' + results[0].productId).get()).data().status, 'draft');
  const laterClick = await fixture.service.reviewToDraft(staff, { ...input, operationId: id() }); assert.equal(laterClick.productId, results[0].productId); assert.equal(laterClick.existing, true);
  assert.equal((await db.collection('products').where('originReviewId', '==', fixture.reviewId).get()).size, 1);
});
test('F5.1 local dependency failure does not fabricate zero or collapse independent integrity reads', async () => {
  const db = { collection(name) { return { limit() { return { async get() { if (name === 'payments') throw Error('Synthetic unavailable'); return { size: 0, docs: [] }; } }; } }; } };
  const result = await createRuntimeIntegrity({ db, now: () => clock }).inspect();
  assert.equal(result.state, 'unresolved'); assert.equal(result.complete, false); assert.equal(result.availability.payments, 'source-unavailable'); assert.equal(result.counts.payments, undefined); assert.equal(result.counts.sharedConfiguration, 0);
});

test('J4 existing Section 13 Draft is reconciled before new intent; changed owning source blocks handoff', async () => {
  const fixture = await reviewFixture(), productId = id(); await db.doc('products/' + productId).set({ status: 'draft', originReviewId: fixture.reviewId, originReviewVersion: 1 });
  const recovered = await fixture.service.reviewToDraft(staff, { reviewId: fixture.reviewId, expectedVersion: 1, operationId: id() }); assert.equal(recovered.productId, productId); assert.equal(recovered.existing, true);
  await db.doc('orders/' + fixture.review.orderId + '/work/base').update({ completed: false });
  await assert.rejects(fixture.service.reviewToDraft(staff, { reviewId: fixture.reviewId, expectedVersion: 1, operationId: id() }), { code: 'reuse-not-authorized' });
  assert.equal((await db.collection('products').where('originReviewId', '==', fixture.reviewId).get()).size, 1);
});
