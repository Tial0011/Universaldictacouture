import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createAccountService } from '../netlify/lib/account-service.js';
import { createTransactionService } from '../netlify/lib/transaction-service.js';
import { createConversationReviewService } from '../netlify/lib/transaction-conversation-review.js';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8089';
process.env.METADATA_SERVER_DETECTION = 'none';

const id = () => randomUUID();
const secret = 'section-10-local-emulator-secret-not-production';
let app, db, communication, clock, customer, other, staff;

async function seedCustomer(label) {
  const uid = id(), accountId = id();
  await db.doc(`accounts/${accountId}`).set({ accountId, principalUid: uid, lifecycle: 'ACTIVE', epoch: 1, version: 1, validAfter: 0 });
  await db.doc(`accountBindings/${uid}`).set({ uid, accountId, active: true, epoch: 1 });
  await db.doc(`customerProfiles/${accountId}`).set({ accountId, version: 1, fields: { fullName: label, preferredName: '', phoneNumber: '', publicDisplayName: '', profilePhoto: null } });
  return { uid, accountId, auth_time: Math.floor(clock / 1000) };
}

async function seedStaff() {
  const uid = id(), staffId = id();
  const route = purpose => ({ domainWide: { active: true, purpose } });
  await db.doc(`admins/${uid}`).set({ active: true, staffId, functionAsCouturier: true, eligible: true, available: true, displayName: 'Sample Dicta Couturier', capabilities: { 'chats.read': route('customer-service'), 'chats.reply': route('customer-service') } });
  await db.doc(`staffIdentities/${staffId}`).set({ staffId, principalUid: uid, active: true });
  return { uid, staffId, kind: 'staff', auth_time: Math.floor(clock / 1000) };
}

before(async () => {
  clock = Date.UTC(2026, 9, 9, 12);
  app = initializeApp({ projectId: `demo-udc-s10-${id().slice(0, 8)}` }, `section10-${id()}`);
  db = getFirestore(app);
  const account = createAccountService({ db, auth: {}, secret, now: () => clock });
  const transactions = createTransactionService(account);
  communication = createConversationReviewService(transactions);
  customer = await seedCustomer('Customer One');
  other = await seedCustomer('Customer Two');
  staff = await seedStaff();
});

after(async () => { await db?.terminate(); await deleteApp(app); });

test('legacy history remains read-only, paged and isolated to the original principal', async () => {
  const owner = await seedCustomer('Legacy');
  const path = db.doc(`conversations/${owner.uid}`), batch = db.batch();
  batch.set(path, { customerId: owner.uid });
  for (let index = 0; index < 32; index++) batch.set(path.collection('messages').doc(`old-${index}`), { body: `Original ${index}`, senderRole: index % 2 ? 'admin' : 'customer', createdAt: Timestamp.fromMillis(clock + index) });
  await batch.commit();
  const first = await communication.legacyHistory(owner);
  assert.equal(first.items.length, 30);
  assert.equal(first.items.at(-1).body, 'Original 31');
  assert.equal(first.items.at(-1).author, 'Dicta Couturier');
  const older = await communication.legacyHistory(owner, first.cursor);
  assert.equal(older.items.length, 2);
  assert.equal(older.items[0].body, 'Original 0');
  assert.deepEqual((await communication.legacyHistory(other)).items, []);
  await assert.rejects(communication.legacyHistory(other, first.cursor), { code: 'invalid-cursor' });
  await db.doc(`accounts/${owner.accountId}`).update({ lifecycle: 'DELETED' });
  await assert.rejects(communication.legacyHistory(owner));
  assert.equal((await path.collection('messages').get()).size, 32);
});

test('eligible Couturier selection creates one reusable Free Chat and no Order', async () => {
  const ordersBefore = (await db.collection('orders').get()).size;
  const available = await communication.availableCouturiers(customer);
  assert.deepEqual(available.records, [{ staffId: staff.staffId, label: 'Dicta Couturier 1' }]);
  const input = { operationId: id(), couturierStaffId: staff.staffId };
  const first = await communication.generalChat(customer, input);
  assert.deepEqual(first, await communication.generalChat(customer, input));
  assert.equal(first.chatId, `general:${customer.accountId}:${staff.staffId}`);
  assert.equal((await db.collection('orders').get()).size, ordersBefore);
});

test('conversation discovery is account and current Staff-authority scoped', async () => {
  const chat = await communication.generalChat(customer, { operationId: id(), couturierStaffId: staff.staffId });
  await communication.generalChat(other, { operationId: id(), couturierStaffId: staff.staffId });
  assert.deepEqual((await communication.conversations(customer)).records.map(row => row.chatId), [chat.chatId]);
  assert.equal((await communication.conversations(staff)).records.length >= 2, true);
  await assert.rejects(communication.conversation(other, chat.chatId), { code: 'permission-denied' });
});

test('send, Reply, Edit, Delete, Search, unread and authoritative 30-minute expiry converge', async () => {
  const { chatId } = await communication.generalChat(customer, { operationId: id(), couturierStaffId: staff.staffId });
  const sendInput = { chatId, body: 'Please help with this weave.', operationId: id() };
  const original = await communication.send(customer, sendInput);
  assert.deepEqual(original, await communication.send(customer, sendInput));
  const reply = await communication.send(staff, { chatId, body: 'I can help.', replyToMessageId: original.messageId, operationId: id() });
  let page = await communication.messages(customer, chatId);
  assert.equal(page.items.find(row => row.id === reply.messageId).replyTo.messageId, original.messageId);
  assert.equal(page.items.find(row => row.id === original.messageId).canEdit, true);
  const edited = await communication.changeMessage(customer, { chatId, messageId: original.messageId, expectedVersion: 1, action: 'edit', body: 'Please help with this Aso Oke weave.', operationId: id() });
  assert.equal(edited.version, 2);
  assert.equal((await communication.conversation(customer, chatId)).messageRevision, 1);
  assert.equal((await communication.search(customer, chatId, 'Aso Oke')).items[0].id, original.messageId);
  await communication.markRead(customer, { chatId, sequence: reply.sequence, operationId: id() });
  assert.equal((await communication.conversations(customer)).records[0].unread, 0);
  await communication.changeMessage(staff, { chatId, messageId: reply.messageId, expectedVersion: 1, action: 'delete', operationId: id() });
  assert.equal((await communication.conversation(customer, chatId)).messageRevision, 2);
  page = await communication.messages(customer, chatId);
  assert.equal(page.items.find(row => row.id === reply.messageId).deleted, true);
  clock += 30 * 60 * 1000 + 1;
  await assert.rejects(communication.changeMessage(customer, { chatId, messageId: original.messageId, expectedVersion: 2, action: 'edit', body: 'Too late', operationId: id() }), { code: 'message-action-expired' });
  assert.ok((await db.collection('chatMessageHistory').get()).size >= 2);
});

test('transaction Chat projects one current Pin and immutable system events remain protected', async () => {
  const orderId = id(), chatId = `order:${orderId}`;
  await db.doc(`orders/${orderId}`).set({ _ownerVersion: 3, orderId, accountId: customer.accountId, version: 2, status: 'OPEN', currentWork: 'base', activeExtensionId: null, assignedStaffId: staff.staffId, chatId, reviewEnabled: false });
  await db.doc(`orders/${orderId}/work/base`).set({ componentId: 'base', version: 2, currentEdition: 1, workingVersion: 1, businessApproval: { edition: 1 }, customerApproval: { edition: 1 }, paymentEnabled: { edition: 1 }, fulfilment: 'NOT STARTED', delivery: 'NOT PREPARED', completed: false, cancelled: false, issues: {} });
  await db.doc(`orders/${orderId}/work/base/editions/1`).set({ number: 1, entries: [{ rootId: 'piece', label: 'Captured piece', quantity: 1, unitAmountMinor: 100000 }], totalMinor: 100000, amountDueNowMinor: 100000 });
  await db.doc(`accountConversations/${chatId}`).set({ _ownerVersion: 3, chatId, kind: 'transaction', orderId, accountId: customer.accountId, sequence: 0, createdAt: clock });
  const detail = await communication.conversation(customer, chatId);
  assert.equal(detail.currentPin.id, `${orderId}:base:edition:1`);
  assert.equal(detail.order.amountDueNowMinor, 100000);
  const messageId = id();
  await db.doc(`accountConversations/${chatId}/messages/${messageId}`).set({ messageId, chatId, kind: 'transaction-event', body: 'Payment enabled', actor: { kind: 'system' }, version: 1, sequence: 1, createdAt: clock, attachmentReferenceIds: [] });
  await db.doc(`accountConversations/${chatId}`).update({ sequence: 1, updatedAt: clock });
  await assert.rejects(communication.changeMessage(customer, { chatId, messageId, expectedVersion: 1, action: 'delete', operationId: id() }), { code: 'message-action-expired' });
  await db.doc(`orders/${orderId}/work/base`).delete();
  const partial = await communication.conversation(customer, chatId);
  assert.equal(partial.sourceUnavailable, true);
  assert.equal(partial.currentPin, null);
  assert.equal(partial.order, undefined);
  assert.equal((await communication.messages(customer, chatId)).items[0].id, messageId);
  await assert.rejects(communication.send(customer, { chatId, operationId: id(), body: 'Source unavailable' }));
});

test('photo deletion atomically revokes references, keeps audit and hides deleted quoted content', async () => {
  const { chatId } = await communication.generalChat(customer, { operationId: id(), couturierStaffId: staff.staffId });
  const assetId = id();
  await db.doc(`mediaAssets/${assetId}`).set({ assetId, domain: 'chat', objectId: chatId, actorUid: customer.uid, state: 'validated', expectedEpoch: 1 });
  const original = await communication.send(customer, { chatId, body: 'Private photo', assetIds: [assetId], operationId: id() });
  const reply = await communication.send(customer, { chatId, body: 'A reply', replyToMessageId: original.messageId, operationId: id() });
  const referenceId = (await communication.exactMessage(customer, chatId, original.messageId)).item.attachments[0].referenceId;
  const input = { chatId, messageId: original.messageId, expectedVersion: 1, action: 'delete', operationId: id() };
  const deleted = await communication.changeMessage(customer, input);
  assert.deepEqual(await communication.changeMessage(customer, input), deleted);
  assert.equal((await db.doc(`mediaReferences/${referenceId}`).get()).data().active, false);
  const message = (await communication.exactMessage(customer, chatId, original.messageId)).item;
  assert.equal(message.deleted, true); assert.equal(message.body, ''); assert.deepEqual(message.attachments, []);
  assert.equal((await communication.exactMessage(customer, chatId, reply.messageId)).item.replyTo.unavailable, true);
  assert.equal((await db.doc(`chatMessageHistory/${input.operationId}`).get()).data().previousBody, 'Private photo');
});

test('concurrent starts and sends converge; conflicting message revisions cannot overwrite', async () => {
  const owner = await seedCustomer('Concurrent');
  const starts = await Promise.all([1, 2].map(() => communication.generalChat(owner, { operationId: id(), couturierStaffId: staff.staffId })));
  assert.equal(starts[0].chatId, starts[1].chatId);
  const chatId = starts[0].chatId, sendInput = { chatId, body: 'One intent', operationId: id() };
  const sent = await Promise.all([communication.send(owner, sendInput), communication.send(owner, sendInput)]);
  assert.equal(sent[0].messageId, sent[1].messageId);
  assert.equal((await communication.messages(owner, chatId)).items.length, 1);
  const edits = await Promise.allSettled(['first', 'second'].map(body => communication.changeMessage(owner, { chatId, messageId: sent[0].messageId, expectedVersion: 1, action: 'edit', body, operationId: id() })));
  assert.equal(edits.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await communication.exactMessage(owner, chatId, sent[0].messageId)).item.version, 2);
});

test('older exact events, private cursor paging and principal isolation remain authorized', async () => {
  const owner = await seedCustomer('Paged'), batch = db.batch();
  for (let index = 0; index < 53; index++) {
    const chatId = `history:${owner.accountId}:${String(index).padStart(3, '0')}`;
    batch.set(db.doc(`accountConversations/${chatId}`), { _ownerVersion: 3, chatId, kind: 'general', accountId: owner.accountId, sequence: 0, createdAt: clock });
  }
  await batch.commit();
  const first = await communication.conversations(owner), next = await communication.conversations(owner, first.cursor);
  assert.equal(first.records.length, 50); assert.equal(next.records.length, 3); assert.equal(next.complete, true);
  assert.equal(new Set([...first.records, ...next.records].map(row => row.chatId)).size, 53);
  await assert.rejects(communication.conversations(other, first.cursor), { code: 'invalid-cursor' });
  await assert.rejects(communication.conversations(owner, 'tampered'), { code: 'invalid-cursor' });
  const chatId = first.records[0].chatId, messages = db.batch();
  for (let index = 1; index <= 35; index++) messages.set(db.doc(`accountConversations/${chatId}/messages/event-${index}`), { messageId: `event-${index}`, chatId, kind: 'ordinary', actor: { kind: 'customer', accountId: owner.accountId }, body: `History ${index}`, sequence: index, createdAt: clock, version: 1 });
  await messages.commit();
  assert.equal((await communication.messages(owner, chatId)).items.length, 30);
  assert.equal((await communication.exactMessage(owner, chatId, 'event-1')).item.body, 'History 1');
  await assert.rejects(communication.exactMessage(other, chatId, 'event-1'), { code: 'permission-denied' });
});

test('Staff capability revocation denies current reads and sends while preserving history', async () => {
  const member = await seedStaff();
  const { chatId } = await communication.generalChat(customer, { operationId: id(), couturierStaffId: member.staffId });
  const sent = await communication.send(member, { chatId, body: 'Historical Staff authorship', operationId: id() });
  await db.doc(`admins/${member.uid}`).update({ active: false });
  await assert.rejects(communication.messages(member, chatId));
  await assert.rejects(communication.send(member, { chatId, body: 'Denied', operationId: id() }));
  const message = (await communication.exactMessage(customer, chatId, sent.messageId)).item;
  assert.equal(message.actor.staffId, member.staffId); assert.equal(message.body, 'Historical Staff authorship');
});
