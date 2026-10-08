import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import sharp from 'sharp';
import { createAccountService } from '../netlify/lib/account-service.js';
import { createPretransactionService, publicProduct } from '../netlify/lib/pretransaction-service.js';
import { createMediaService } from '../netlify/lib/media-service.js';
import { createAccountHandler } from '../netlify/lib/account-handler.js';
const id = () => randomUUID(), secret = 'isolated-part2-emulator-only-secret-not-production';
let app, db, auth, account, cluster, media, a, b, staff, productId, version, request, clock;
const blobs = new Map(), store = () => ({ set: async (key, bytes) => blobs.set(key, Buffer.from(bytes)), get: async key => blobs.get(key), delete: async key => blobs.delete(key) });
async function customer(name) {
  const email = `${name}-${id()}@example.test`;
  await account.register({ email, password: 'Section16-Local-Only!', operationId: id() });
  const user = await auth.getUserByEmail(email), claims = { uid: user.uid, auth_time: Math.floor(clock / 1000) };
  return { claims, context: await account.context(claims) };
}
const mutation = (action, fields) => cluster.mutateProduct(staff, { operationId: id(), productId, expectedVersion: version, action, ...(fields ? { fields } : {}) });
before(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8089'; process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  app = initializeApp({ projectId: 'demo-udc-section12' }, 'part2-' + id()); db = getFirestore(app); auth = getAuth(app); clock = Date.now();
  account = createAccountService({ db, auth, secret, now: () => clock }); cluster = createPretransactionService(account); media = createMediaService(account, cluster, { getPrivateStore: store });
  a = await customer('part2-a'); b = await customer('part2-b');
  const uid = id(), staffId = id(), capabilities = Object.fromEntries(['create', 'read', 'edit', 'commercial', 'media', 'discovery', 'publish', 'unpublish', 'archive', 'restore', 'delete'].map(action => ['products.' + action, { domainWide: { active: true, purpose: 'catalogue' } }]));
  await db.doc('admins/' + uid).set({ active: true, staffId, capabilities }); await db.doc('staffIdentities/' + staffId).set({ staffId, active: true, principalUid: uid });
  staff = { uid, auth_time: Math.floor(clock / 1000), kind: 'staff' };
});
after(async () => { await db?.terminate(); await deleteApp(app); });

test('M03 durable Draft creation is idempotent, private and allowlisted', async () => {
  const input = { action: 'create', operationId: id(), fields: { name: 'Current Piece', price: 25000, unitLabel: 'per set', category: ['Aso Oke'], images: [{ url: 'https://example.test/public-piece.jpg' }] } };
  const results = await Promise.all([cluster.mutateProduct(staff, input), cluster.mutateProduct(staff, input)]);
  productId = results[0].productId; version = results[0].version;
  assert.deepEqual(results[0], results[1]); assert.notEqual(productId, input.fields.name);
  assert.equal((await cluster.catalogue(productId)).product, null);
  await assert.rejects(cluster.mutateProduct(a.claims, { ...input, operationId: id() }), { code: 'permission-denied' });
  await assert.rejects(cluster.mutateProduct(staff, { ...input, operationId: id(), fields: { role: 'Super Admin' } }), { code: 'invalid-argument' });
  await assert.rejects(cluster.mutateProduct(staff, { ...input, operationId: id(), fields: { name: { internal: 'not text' } } }), { code: 'invalid-argument' });
});
test('M03 explicit Publish retains private working version and immutable transaction evidence', async () => {
  version = (await mutation('publish')).version;
  const historical = db.doc('orders/part2-history-' + id()); await historical.set({ productId, capturedName: 'Current Piece', price: 25000 });
  const result = await mutation('save', { name: '<script>inert working text</script>', price: 30000 }); version = result.version;
  assert.equal((await cluster.catalogue(productId)).product.name, 'Current Piece');
  assert.equal((await cluster.catalogue(productId)).product.price, 25000);
  await assert.rejects(cluster.mutateProduct(staff, { action: 'publish', productId, expectedVersion: version - 1, operationId: id() }), { code: 'stale-conflict' });
  version = (await mutation('publish')).version;
  assert.equal((await cluster.catalogue(productId)).product.price, 30000);
  assert.equal((await historical.get()).data().price, 25000);
  assert.ok(!(JSON.stringify((await cluster.catalogue(productId))).includes('commercialBefore')));
});
test('M03 two editors, Archive vs edit, Restore and hard-delete fail safely', async () => {
  const results = await Promise.allSettled([mutation('save', { description: 'First' }), mutation('save', { description: 'Second' })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); version = results.find(r => r.status === 'fulfilled').value.version;
  version = (await mutation('archive')).version;
  assert.equal((await cluster.catalogue(productId)).product, null);
  await assert.rejects(mutation('save', { name: 'Zombie' }), { code: 'stale-conflict' });
  await assert.rejects(mutation('hard-delete'), { code: 'historical-reference-check-unavailable' });
  version = (await mutation('restore')).version; assert.equal((await cluster.catalogue(productId)).product, null);
  version = (await mutation('publish')).version;
});
test('M03 label validation and unknown result reconcile without second consequence', async () => {
  const pattern = 'Woven Pattern ' + id(), taxonomy = db.doc('taxonomy/' + id()); await taxonomy.set({ dimension: 'fabric', name: pattern, active: true });
  version = (await mutation('save', { shopBy: { fabric: [pattern] } })).version;
  await taxonomy.update({ active: false });
  await assert.rejects(mutation('save', { shopBy: { fabric: [pattern] } }), { code: 'taxonomy-unavailable' });
  const operationId = id(), input = { action: 'save', fields: { name: 'One Effect' }, productId, expectedVersion: version, operationId };
  const result = await cluster.mutateProduct(staff, input); version = result.version;
  assert.equal((await cluster.reconcile(staff, operationId)).version, version);
  assert.equal((await cluster.mutateProduct(staff, input)).version, version);
  assert.equal((await cluster.reconcile(b.claims, operationId)).state, 'unknown');
});
test('M05 same Account-target Save converges, opposite CAS conflicts and contains no Product clone', async () => {
  const input = { operationId: id(), kind: 'piece', targetId: productId, saved: true, expectedVersion: 0, expectedEpoch: a.context.epoch };
  const results = await Promise.all([cluster.mutateSave(a.claims, input), cluster.mutateSave(a.claims, input)]);
  assert.equal(results[0].version, 1); assert.deepEqual(results[0], results[1]);
  const raw = (await cluster.relationshipRef(a.context.accountId, 'piece', productId).get()).data(); assert.equal(raw.name, undefined); assert.equal(raw.price, undefined);
  assert.equal((await cluster.listSaves(b.claims, 'piece')).records.length, 0);
  const attempts = await Promise.allSettled([true, false].map(saved => cluster.mutateSave(a.claims, { ...input, operationId: id(), expectedVersion: 1, saved })));
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  await assert.rejects(cluster.mutateSave(a.claims, { ...input, operationId: id(), accountId: b.context.accountId }), { code: 'invalid-argument' });
});
test('M05 current target state removes hidden rows/counts and repeated Unsave converges', async () => {
  version = (await mutation('unpublish')).version;
  assert.equal((await cluster.listSaves(a.claims, 'piece')).records.length, 0);
  const state = (await cluster.relationshipRef(a.context.accountId, 'piece', productId).get()).data();
  const input = { kind: 'piece', targetId: productId, saved: false, operationId: id(), expectedVersion: state.version, expectedEpoch: a.context.epoch };
  const result = await cluster.mutateSave(a.claims, input); assert.deepEqual(result, await cluster.mutateSave(a.claims, input));
  await assert.rejects(cluster.mutateSave(a.claims, { ...input, saved: true, operationId: id(), expectedVersion: result.version }), { code: 'target-unavailable' });
  version = (await mutation('publish')).version;
});
test('M05 guest positive import is owner-qualified, deduplicated and does not erase Account state', async () => {
  const boundAccount = createAccountService({ db, auth, secret, now: () => clock, guestIntentOwner: cluster.importGuest });
  const input = { operationId: id(), expectedEpoch: a.context.epoch, intent: { kind: 'saved-piece', objectId: productId, positive: true } };
  await boundAccount.importGuestIntent(a.claims, input); await boundAccount.importGuestIntent(a.claims, input);
  assert.equal((await cluster.listSaves(a.claims, 'piece')).records.length, 1);
  await assert.rejects(boundAccount.importGuestIntent(a.claims, { ...input, operationId: id(), intent: { ...input.intent, positive: false } }), { code: 'invalid-argument' });
  const reviewId = id(); await db.doc('reviews/' + reviewId).set({ status: 'published', body: 'Owner content', internalNotes: 'hidden' });
  await cluster.mutateSave(a.claims, { kind: 'review', targetId: reviewId, saved: true, expectedVersion: 0, expectedEpoch: a.context.epoch, operationId: id() });
  assert.deepEqual(Object.keys((await cluster.listSaves(a.claims, 'review')).records[0]).sort(), ['targetId', 'version']);
  await db.doc('reviews/' + reviewId).update({ status: 'hidden' }); assert.equal((await cluster.listSaves(a.claims, 'review')).records.length, 0);
});
test('M06 request stable identity, source capture, field allowlist and version races', async () => {
  const input = { operationId: id(), expectedEpoch: a.context.epoch, expectedVersion: 0, sourceProductId: productId, fields: { notes: 'Private idea', measurements: { waist: 30 }, quantity: 1 } };
  request = await cluster.mutateRequest(a.claims, input); assert.deepEqual(request, await cluster.mutateRequest(a.claims, input));
  await assert.rejects(cluster.readRequest(b.claims, request.requestId), { code: 'permission-denied' });
  await assert.rejects(cluster.mutateRequest(a.claims, { ...input, operationId: id(), fields: { assignedStaffId: staff.uid } }), { code: 'invalid-argument' });
  const source = (await cluster.readRequest(a.claims, request.requestId)).source;
  version = (await mutation('save', { name: 'New Current Name', price: 50000 })).version; version = (await mutation('publish')).version;
  assert.deepEqual((await cluster.readRequest(a.claims, request.requestId)).source, source);
  const edits = await Promise.allSettled(['One', 'Two'].map(notes => cluster.mutateRequest(a.claims, { requestId: request.requestId, expectedVersion: request.version, expectedEpoch: a.context.epoch, operationId: id(), fields: { notes } })));
  assert.equal(edits.filter(r => r.status === 'fulfilled').length, 1); request.version = edits.find(r => r.status === 'fulfilled').value.version;
  await assert.rejects(cluster.handoff(a.claims, { requestId: request.requestId, expectedVersion: request.version, expectedEpoch: a.context.epoch, operationId: id() }), { code: 'main-order-owner-unavailable' });
});
test('M06 complete sensitive route, revoked capability and no assignment privilege splice', async () => {
  const member = (await db.doc('admins/' + staff.uid).get()).data();
  const capabilities = { ...member.capabilities, 'customStyle.read': { assignmentDerived: { active: true, purpose: 'custom-style' } } };
  await db.doc('admins/' + staff.uid).update({ capabilities, functionAsCouturier: true, eligible: true }); await db.doc('customStyleRequests/' + request.requestId).update({ assignedStaffId: member.staffId });
  await assert.rejects(cluster.readRequest(staff, request.requestId), { code: 'permission-denied' });
  capabilities['customStyle.read'] = { dataPurpose: { active: true, purpose: 'custom-style', ids: [request.requestId], dataClasses: ['custom-style-private'] } };
  await db.doc('admins/' + staff.uid).update({ capabilities }); assert.equal((await cluster.readRequest(staff, request.requestId)).fields.measurements.waist, 30);
  capabilities['customStyle.read'].dataPurpose.active = false; await db.doc('admins/' + staff.uid).update({ capabilities });
  await assert.rejects(cluster.readRequest(staff, request.requestId), { code: 'permission-denied' });
});
test('M04 private bytes stage separately, attach exact version, copied locator and derivative deny B', async () => {
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#d4b070' } }).png().toBuffer();
  const input = { operationId: id(), domain: 'custom-style', objectId: request.requestId, expectedVersion: request.version, expectedEpoch: a.context.epoch, contentType: 'image/png', base64: bytes.toString('base64') };
  const staged = await media.stage(a.claims, input); assert.equal(staged.state, 'staged');
  assert.deepEqual((await cluster.readRequest(a.claims, request.requestId)).mediaRefs, []);
  const attached = await media.attach(a.claims, { operationId: id(), domain: input.domain, objectId: input.objectId, expectedVersion: request.version, expectedEpoch: a.context.epoch, assetIds: [staged.assetId] }); request.version = attached.version;
  assert.ok((await media.deliver(a.claims, attached.referenceIds[0])).byteLength);
  await assert.rejects(media.deliver(b.claims, attached.referenceIds[0]), { code: 'permission-denied' });
  await assert.rejects(media.deliver(b.claims, attached.referenceIds[0], { thumbnail: true }), { code: 'permission-denied' });
  await assert.rejects(media.deliver(null, attached.referenceIds[0], { publicOnly: true }), { code: 'permission-denied' });
  await assert.rejects(media.purgeStaged(staged.assetId), { code: 'retention-owner-required' });
});
test('M04 late upload cannot replace newer selection, detach is not purge, staged cleanup idempotent', async () => {
  const bytes = await sharp({ create: { width: 6, height: 6, channels: 3, background: '#111111' } }).png().toBuffer();
  const input = { operationId: id(), domain: 'custom-style', objectId: request.requestId, expectedVersion: request.version, expectedEpoch: a.context.epoch, contentType: 'image/png', base64: bytes.toString('base64') };
  const late = await media.stage(a.claims, input), current = await media.stage(a.claims, { ...input, operationId: id() });
  const attach = { operationId: id(), domain: input.domain, objectId: input.objectId, expectedVersion: request.version, expectedEpoch: a.context.epoch, assetIds: [current.assetId] };
  request.version = (await media.attach(a.claims, attach)).version;
  await assert.rejects(media.attach(a.claims, { ...attach, operationId: id(), assetIds: [late.assetId] }), { code: 'stale-conflict' });
  assert.equal((await media.purgeStaged(late.assetId)).state, 'purged'); assert.equal((await media.purgeStaged(late.assetId)).state, 'purged');
  await assert.rejects(media.stage(a.claims, { ...input, operationId: id(), domain: 'payment-proof' }), { code: 'media-owner-unavailable' });
});
test('M06 transaction-owner port commits one logical handoff, reconciles ack loss and preserves source snapshot', async () => {
  const owner = { prepare: async (tx, context) => {
    const orderRef = db.doc('orders/port-fixture-' + context.logicalId), prior = await tx.get(orderRef);
    return { orderId: orderRef.id, commit: () => { if (!prior.exists) tx.create(orderRef, { accountId: context.source.accountId, sourceSnapshot: context.source, executor: 'test:m07-owner-port' }); } };
  }, exists: async orderId => (await db.doc('orders/' + orderId).get()).exists };
  const port = createPretransactionService(account, { mainOrderOwner: owner });
  const input = { requestId: request.requestId, expectedVersion: request.version, expectedEpoch: a.context.epoch, operationId: id() };
  const results = await Promise.all([port.handoff(a.claims, input), port.handoff(a.claims, input)]); assert.deepEqual(results[0], results[1]);
  const result = await port.handoff(a.claims, { ...input, operationId: id() }); assert.equal(result.orderId, results[0].orderId);
  assert.equal((await port.reconcile(a.claims, input.operationId)).orderId, result.orderId);
  await cluster.mutateRequest(a.claims, { requestId: request.requestId, expectedVersion: request.version, expectedEpoch: a.context.epoch, fields: { notes: 'Later current edit' }, operationId: id() });
  assert.notEqual((await db.doc('orders/' + result.orderId).get()).data().sourceSnapshot.fields.notes, 'Later current edit');
});
test('M01/M03-M06 current lifecycle wins over saves, request edits and copied media', async () => {
  await db.doc('accounts/' + a.context.accountId).update({ lifecycle: 'RESTRICTED' });
  await assert.rejects(cluster.listSaves(a.claims, 'piece'), { code: 'account-restricted' });
  await assert.rejects(cluster.readRequest(a.claims, request.requestId), { code: 'account-restricted' });
  const refs = (await db.doc('customStyleRequests/' + request.requestId).get()).data().mediaRefs;
  await assert.rejects(media.deliver(a.claims, refs[0]), { code: 'account-restricted' });
  await db.doc('accounts/' + a.context.accountId).update({ lifecycle: 'ACTIVE' });
});
test('public HTTP catalogue minimizes before response, no passive GET mutation or privileged body fields', async () => {
  await db.doc('products/' + productId).update({ internalNotes: 'NEVER DISCLOSE', securitySecret: 'NEVER DISCLOSE' });
  const handler = createAccountHandler({ db, auth, secret, origin: 'http://127.0.0.1:5182' });
  const response = await handler(new Request(`http://127.0.0.1:5182/.netlify/functions/account?action=catalogue&productId=${productId}`));
  assert.equal(response.status, 200); assert.ok(!(await response.text()).includes('NEVER DISCLOSE'));
  assert.equal((await handler(new Request('http://127.0.0.1:5182/.netlify/functions/account?action=save-mutate'))).status, 405);
  assert.equal(publicProduct('p', { status: 'draft', name: 'Private' }), null);
});
test('M04 Product working references stay private until publication, previous live reference survives replacement', async () => {
  let productMedia;
  const productOwner = createPretransactionService(account, { prepareProductMedia: (...args) => productMedia.prepareProductReferences(...args) });
  productMedia = createMediaService(account, productOwner, { getPrivateStore: store });
  const bytes = await sharp({ create: { width: 5, height: 5, channels: 3, background: '#ac8c49' } }).png().toBuffer();
  const stage = () => productMedia.stage(staff, { operationId: id(), domain: 'product', objectId: productId, expectedVersion: version, contentType: 'image/png', base64: bytes.toString('base64') });
  const first = await stage();
  const recordedActor = (await db.doc('mediaAssets/' + first.assetId).get()).data().originalActor;
  assert.equal(recordedActor.kind, 'staff'); assert.equal(recordedActor.staffId, (await db.doc('admins/' + staff.uid).get()).data().staffId);
  version = (await productOwner.mutateProduct(staff, { action: 'save', productId, expectedVersion: version, operationId: id(), fields: { images: [{ assetId: first.assetId, alt: 'Working image' }] } })).version;
  const privateReference = (await db.doc('products/' + productId).get()).data().images[0].referenceId;
  await assert.rejects(productMedia.deliver(null, privateReference, { publicOnly: true }), { code: 'permission-denied' });
  assert.ok((await productMedia.deliver(staff, privateReference)).byteLength);
  version = (await productOwner.mutateProduct(staff, { action: 'publish', productId, expectedVersion: version, operationId: id() })).version;
  assert.ok((await productMedia.deliver(null, privateReference, { publicOnly: true, thumbnail: true })).byteLength);
  const second = await stage();
  version = (await productOwner.mutateProduct(staff, { action: 'save', productId, expectedVersion: version, operationId: id(), fields: { images: [{ assetId: second.assetId, alt: 'New private selection' }] } })).version;
  const secondReference = (await db.doc('products/' + productId).get()).data().images[0].referenceId;
  assert.ok((await productMedia.deliver(null, privateReference, { publicOnly: true })).byteLength);
  await assert.rejects(productMedia.deliver(null, secondReference, { publicOnly: true }), { code: 'permission-denied' });
  version = (await productOwner.mutateProduct(staff, { action: 'publish', productId, expectedVersion: version, operationId: id() })).version;
  await assert.rejects(productMedia.deliver(null, privateReference, { publicOnly: true }), { code: 'permission-denied' });
  await assert.rejects(productMedia.purgeStaged(first.assetId), { code: 'retention-owner-required' });
  version = (await productOwner.mutateProduct(staff, { action: 'unpublish', productId, expectedVersion: version, operationId: id() })).version;
  await assert.rejects(productMedia.deliver(null, secondReference, { publicOnly: true }), { code: 'permission-denied' });
});
test('M04 current authorization is rechecked after slow media retrieval before disclosure', async () => {
  const references = (await db.doc('customStyleRequests/' + request.requestId).get()).data().mediaRefs;
  const slowMedia = createMediaService(account, cluster, { getPrivateStore: () => ({ get: async key => {
    await db.doc('accounts/' + a.context.accountId).update({ lifecycle: 'RESTRICTED' }); return blobs.get(key);
  } }) });
  await assert.rejects(slowMedia.deliver(a.claims, references[0]), { code: 'account-restricted' });
  await db.doc('accounts/' + a.context.accountId).update({ lifecycle: 'ACTIVE' });
});
