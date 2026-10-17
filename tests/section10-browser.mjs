import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import sharp from 'sharp';
import { createAccountService } from '../netlify/lib/account-service.js';

// Owner-approved isolated Chrome + Firebase emulators only. No production
// credentials, browser profile, messages, Orders, media or deployment.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8089';
process.env.METADATA_SERVER_DETECTION = 'none';

const origin = 'http://127.0.0.1:5182';
const app = initializeApp({ projectId: 'demo-udc-section12' }, `section10-browser-${randomUUID()}`);
const db = getFirestore(app), auth = getAuth(app);
const account = createAccountService({ db, auth, secret: 'local-section16-qa-only-secret-not-production' });
const password = 'Section10-Local-QA-Only!';
const artifactDir = '.tools.local/section10-runtime';
await mkdir(artifactDir, { recursive: true });

async function customer(label) {
  const email = `s10-${label}-${randomUUID()}@example.test`;
  await account.register({ email, password, operationId: randomUUID() });
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { emailVerified: true });
  return { uid: user.uid, email };
}

const customerA = await customer('a'), customerB = await customer('b');
const staffUid = randomUUID(), staffId = randomUUID(), staffEmail = `s10-staff-${staffUid}@example.test`;
await auth.createUser({ uid: staffUid, email: staffEmail, password, emailVerified: true });
const chatCapability = {
  domainWide: { active: true, purpose: 'customer-service' },
  dataPurpose: { active: true, purpose: 'customer-service', allObjects: true, dataClasses: ['chat-attachment'] },
};
await db.doc(`admins/${staffUid}`).set({ staffId, active: true, functionAsCouturier: true, eligible: true, available: true, displayName: 'Browser QA Dicta Couturier', capabilities: { 'chats.read': chatCapability, 'chats.reply': chatCapability } });
await db.doc(`staffIdentities/${staffId}`).set({ staffId, principalUid: staffUid, active: true });
const ordersBefore = (await db.collection('orders').get()).size;

const pages = await (await fetch('http://127.0.0.1:9228/json')).json();
const target = pages.find(page => page.type === 'page');
assert.ok(target, 'The isolated local Chrome page is available');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let serial = 0;
const pending = new Map(), browserErrors = [];
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  const request = pending.get(message.id);
  if (request) { pending.delete(message.id); clearTimeout(request.timer); if (message.error) request.reject(Error(message.error.message)); else request.resolve(message.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial;
  pending.set(id, { resolve, reject, timer: setTimeout(() => reject(Error(`${method} deadline`)), 30000) });
  socket.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression) {
  for (let index = 0; index < 300; index++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw Error(`Not reached: ${expression}\n${await evaluate('document.body.innerText.slice(0,2400)')}`);
}
async function input(selector, value, textarea = false) {
  await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing input '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${textarea ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
async function navigate(path) { await evaluate(`history.pushState({},'',${JSON.stringify(path)});dispatchEvent(new PopStateEvent('popstate'));`); }
async function clickText(text, root = 'document') {
  await until(`[...${root}.querySelectorAll('button,a')].some(element=>element.textContent.trim()===${JSON.stringify(text)}&&element.getClientRects().length&&!element.disabled)`);
  await evaluate(`(()=>{const element=[...${root}.querySelectorAll('button,a')].find(item=>item.textContent.trim()===${JSON.stringify(text)}&&item.getClientRects().length&&!item.disabled);element.click();})()`);
}
async function signIn(email, admin = false) {
  await send('Page.navigate', { url: `${origin}/tests/section11-browser.html?route=${admin ? '/admin' : '/signin'}` });
  const emailId = admin ? '#admin-email' : '#auth-email', passwordId = admin ? '#admin-password' : '#auth-password';
  await until(`!!document.querySelector(${JSON.stringify(emailId)})`);
  await input(emailId, email); await input(passwordId, password);
  await evaluate(`document.querySelector(${JSON.stringify(admin ? '.admin-access form' : '.auth-flow__form')}).requestSubmit()`);
  await until(admin ? "!!document.querySelector('.admin-layout')" : "location.pathname==='/profile'");
}
async function screenshot(name) {
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`${artifactDir}/${name}.png`, Buffer.from(image.data, 'base64'));
}
const widths = [320, 375, 768, 1024, 1440], reflow = [];
async function checkReflow(name) {
  for (const width of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: width < 600 });
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true, `${name} overflow at ${width}px`);
    reflow.push({ name, width, pass: true });
    if (width === 320 || width === 1440) await screenshot(`${name}-${width}`);
  }
  await evaluate("document.documentElement.style.zoom='2'");
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true, `${name} overflow at 200% zoom`);
  await evaluate("document.documentElement.style.zoom='1'");
}

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Accessibility.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await evaluate("import('/src/firebase/auth.js').then(module=>module.signOutUser()).catch(()=>null)");
  await signIn(customerA.email);
  await navigate('/chats');
  await until("document.body.innerText.includes('New guidance Chat')");
  await clickText('Choose a Dicta Couturier');
  await clickText('Dicta Couturier 1');
  await until("!!document.querySelector('.chat-window__header')");
  const chatId = await evaluate("new URLSearchParams(location.search).get('chat')");
  assert.ok(chatId?.startsWith('general:'));
  assert.equal((await db.collection('orders').get()).size, ordersBefore, 'Free Chat did not create an Order');

  await input('.chat-composer textarea', 'Browser secured message', true);
  await evaluate("document.querySelector('.chat-composer').requestSubmit()");
  await until("document.querySelector('.chat-window__messages')?.innerText.includes('Browser secured message')");
  await evaluate("(()=>{const row=[...document.querySelectorAll('.chat-message-row')].find(item=>item.innerText.includes('Browser secured message'));row.querySelector('[aria-label=\"Edit message\"]').click();})()");
  await input('.chat-composer textarea', 'Browser secured message edited', true);
  await evaluate("document.querySelector('.chat-composer').requestSubmit()");
  await until("document.querySelector('.chat-window__messages')?.innerText.includes('Browser secured message edited')&&document.querySelector('.chat-window__messages')?.innerText.includes('Edited')");
  await evaluate("(()=>{const row=[...document.querySelectorAll('.chat-message-row')].find(item=>item.innerText.includes('Browser secured message edited'));row.querySelector('[aria-label=\"Reply to message\"]').click();})()");
  await input('.chat-composer textarea', 'Reply keeps the exact source message.', true);
  await evaluate("document.querySelector('.chat-composer').requestSubmit()");
  await until("!!document.querySelector('.chat-reply-reference')");

  const photoPath = `${artifactDir}/private-chat-photo.png`;
  await sharp({ create: { width: 24, height: 18, channels: 3, background: '#7a1724' } }).png().toFile(photoPath);
  const root = await send('DOM.getDocument'), file = await send('DOM.querySelector', { nodeId: root.root.nodeId, selector: '.chat-composer input[type=file]' });
  await send('DOM.setFileInputFiles', { nodeId: file.nodeId, files: [`${process.cwd()}\\${photoPath.replaceAll('/', '\\')}`] });
  await until("document.body.innerText.includes('Private photo staged')");
  await evaluate("document.querySelector('.chat-composer').requestSubmit()");
  await until("!!document.querySelector('.chat-private-photo')");

  await evaluate("window.confirm=()=>true");
  await evaluate("(()=>{const row=[...document.querySelectorAll('.chat-message-row')].find(item=>item.innerText.includes('Browser secured message edited'));row.querySelector('[aria-label=\"Delete message for everyone\"]').click();})()");
  await until("document.querySelector('.chat-window__messages')?.innerText.includes('This message was deleted')&&document.querySelector('.chat-window__messages')?.innerText.includes('Original message unavailable')");

  await evaluate("document.querySelector('.chat-window__more').click()");
  await clickText('Search This Chat', "document.querySelector('.chat-window')");
  await input('.chat-tool-panel input[type=search]', 'exact source');
  await evaluate("document.querySelector('.chat-tool-panel form').requestSubmit()");
  await until("document.querySelector('.chat-tool-panel')?.innerText.includes('Reply keeps the exact source message.')");
  await evaluate("document.querySelector('.chat-tool-panel__heading button').click()");

  await navigate('/chats');
  await clickText('New guidance Chat');
  await clickText('Dicta Couturier 1');
  await until("new URLSearchParams(location.search).get('chat')!==null&&!!document.querySelector('.chat-window__header')");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('chat')"), chatId, 'Free Chat is reused for the same relationship');
  await checkReflow('customer-chat');
  assert.ok((await send('Accessibility.getFullAXTree')).nodes.some(node => node.role?.value === 'heading' && node.name?.value === 'Chats'));

  await evaluate("import('/src/firebase/auth.js').then(module=>module.signOutUser())");
  await signIn(staffEmail, true);
  await navigate(`/admin/chats?chat=${encodeURIComponent(chatId)}`);
  await until("document.querySelector('.chat-window__messages')?.innerText.includes('Reply keeps the exact source message.')");
  await input('.chat-composer textarea', 'Staff reply from current authorized assignment.', true);
  await evaluate("document.querySelector('.chat-composer').requestSubmit()");
  await until("document.querySelector('.chat-window__messages')?.innerText.includes('Staff reply from current authorized assignment.')");
  assert.ok(await evaluate("!!document.querySelector('.chat-private-photo')"), 'Staff sensitive media route is authorized independently');
  await checkReflow('staff-chat');

  // Explicitly loaded older pages must not retain withdrawn source details or
  // a message deleted elsewhere while only the latest page is being polled.
  const chatPath = db.doc(`accountConversations/${chatId}`), chatRecord = (await chatPath.get()).data();
  const staffMessage = (await chatPath.collection('messages').where('body', '==', 'Staff reply from current authorized assignment.').get()).docs[0];
  const productId = randomUUID(), fixtureBatch = db.batch();
  fixtureBatch.set(db.doc(`products/${productId}`), { _ownerVersion: 2, _version: 1, publicVersion: 1, status: 'published', publishedAt: Date.now(), publicRepresentation: { name: 'Source to withdraw', price: 2000, unitLabel: 'per piece', category: ['Fabric'], images: [] } });
  for (let index = 1; index <= 35; index++) fixtureBatch.set(chatPath.collection('messages').doc(`paging-${index}`), { messageId: `paging-${index}`, chatId, kind: 'ordinary', actor: { kind: 'staff', staffId }, body: `Older-page fixture ${index}`, version: 1, sequence: chatRecord.sequence + index, createdAt: Date.now(), attachmentReferenceIds: [], ...(index === 1 ? { sourceContext: { kind: 'product', productId } } : {}) });
  fixtureBatch.update(chatPath, { sequence: chatRecord.sequence + 35, updatedAt: Date.now() });
  await fixtureBatch.commit();
  await until("document.querySelector('.chat-window__messages')?.innerText.includes('Older-page fixture 35')");
  // Reopen so the initial page boundary reflects the latest history window.
  await navigate('/admin/chats');
  await navigate(`/admin/chats?chat=${encodeURIComponent(chatId)}`);
  await until("document.querySelector('.chat-window__messages')?.innerText.includes('Older-page fixture 35')");
  await clickText('Load older messages');
  await until("document.querySelector('.chat-window__messages')?.innerText.includes('Source to withdraw')");
  await db.doc(`products/${productId}`).update({ status: 'draft' });
  await until("!document.querySelector('.chat-window__messages')?.innerText.includes('Source to withdraw')&&document.querySelector('.chat-window__messages')?.innerText.includes('This piece is no longer publicly available.')");
  await evaluate(`(async()=>{const {accountRequest}=await import('/src/services/accountApi.js');await accountRequest('staff-message-change',{chatId:${JSON.stringify(chatId)},messageId:${JSON.stringify(staffMessage.id)},expectedVersion:1,action:'delete',operationId:crypto.randomUUID()});})()`);
  await until("!document.querySelector('.chat-window__messages')?.innerText.includes('Staff reply from current authorized assignment.')");

  await evaluate("import('/src/firebase/auth.js').then(module=>module.signOutUser())");
  await signIn(customerB.email);
  await navigate(`/chats?chat=${encodeURIComponent(chatId)}`);
  await until("document.body.innerText.includes('Your current access could not be confirmed')||document.body.innerText.includes('Private conversation content is unavailable')");
  assert.equal(await evaluate("document.body.innerText.includes('Staff reply from current authorized assignment.')"), false, 'Wrong Customer cannot see private Chat content');

  assert.deepEqual(browserErrors, []);
  await writeFile(`${artifactDir}/browser-result.json`, JSON.stringify({ freeChatNoOrder: true, freeChatReused: true, persistedText: true, reply: true, edit: true, deleteTombstone: true, privatePhoto: true, staffInbox: true, principalIsolation: true, olderSourceWithdrawal: true, olderDeletionInvalidation: true, accessibilityTree: true, reflow, productionTested: false }, null, 2));
  console.log('Section10 isolated Customer/Staff Chat browser checks passed.');
} finally {
  socket.close();
  await db.terminate();
  await deleteApp(app);
}
