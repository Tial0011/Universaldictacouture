import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc, Timestamp } from "firebase/firestore";
import { studioStaff, route } from "./staff-fixtures.mjs";

const project = "demo-udc-section12";
const password = "Local-Section12-QA-Only!";
async function account(email) {
  const endpoint = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:";
  let response = await fetch(endpoint + "signUp?key=local-test-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  if (!response.ok) response = await fetch(endpoint + "signInWithPassword?key=local-test-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(response.ok, true);
  return (await response.json()).localId;
}
const uid = await account("section12-broad@example.test");
const narrowUid = await account("section12-narrow@example.test");
const minimumUid = await account("section12-minimum@example.test");
const assignedUid = await account("section12-assigned@example.test");
const activityUid = await account("section12-activity@example.test");
await account("section12-unresolved@example.test");
const env = await initializeTestEnvironment({ projectId: project, firestore: { host: "127.0.0.1", port: 8089, rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } });
await env.clearFirestore();
const seed = work => env.withSecurityRulesDisabled(context => work(context.firestore()));
await seed(async store => {
  await setDoc(doc(store, "admins", uid), { ...studioStaff(), displayName: "QA Staff", capabilities: { ...studioStaff().capabilities, "customers.read": route("customer-support"), "orders.read": route("order-operations"), "payments.read": route("payment-operations"), "customStyle.read": route("custom-style") } });
  await setDoc(doc(store, "admins", narrowUid), { active: true, staffId: "staff-narrow", capabilities: { "products.read": { selectedObject: { active: true, purpose: "catalogue", ids: ["p024"] } } } });
  await setDoc(doc(store, "admins", minimumUid), { active: true, staffId: "staff-minimum", capabilities: {} });
  await setDoc(doc(store, "admins", assignedUid), { active: true, staffId: "staff-assigned", capabilities: { "chats.read": { assignmentDerived: { active: true, purpose: "customer-service" } }, "chats.reply": { assignmentDerived: { active: true, purpose: "customer-service" } }, "operations.reconcile": route("operation-result") } });
  await setDoc(doc(store,"admins",activityUid),{active:true,staffId:"activity-narrow",capabilities:{"audit.read":route("audit"),"products.read":{selectedObject:{active:true,purpose:"catalogue",ids:["p024"]}}}});
  for(const [id,targetId] of [["qa-permitted-activity","p024"],["qa-hidden-activity","p000"]]) await setDoc(doc(store,"staffAudit",id),{actorUid:activityUid,actorStaffId:"activity-narrow",targetCollection:"products",targetId,action:"restore",execution:"staff",outcome:"committed",createdAt:Timestamp.fromMillis(1700000000000)});
  for (let i = 0; i < 25; i++) {
    const id = "p" + String(i).padStart(3, "0");
    await setDoc(doc(store, "products", id), { name: `QA Product ${i}`, price: 25000, unitLabel: "per piece", category: ["Aso Oke"], images: [{ url: "/src/assets/images/hero/hero-ready-to-wear.jpg" }], status: "draft", archived: false, _version: 1, updatedAt: Timestamp.fromMillis(1700000000000), ...(i === 0 ? { unitLabel: "" } : {}) });
  }
  await setDoc(doc(store, "reviews/r1"), { status: "pending", published: false, updatedAt: Timestamp.fromMillis(1700000000000), body: "PRIVATE-REVIEW-CONTENT", author: "PRIVATE-CUSTOMER" });
  await setDoc(doc(store, "conversations/c1"), { customerId: "c1", customerName: "PRIVATE-CUSTOMER", customerEmail: "private@example.test", lastMessage: "PRIVATE-CHAT-CONTENT", lastSenderRole: "customer", updatedAt: Timestamp.fromMillis(1700000000000), createdAt: Timestamp.fromMillis(1700000000000), lastMessageId: "m1" });
  await setDoc(doc(store, "conversations/c1/messages/m1"), { body: "PRIVATE-CHAT-CONTENT", senderRole: "customer", senderId: "c1", createdAt: Timestamp.fromMillis(1700000000000) });
});

const target = (await (await fetch("http://127.0.0.1:9227/json")).json()).find(tab => tab.type === "page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const requests = new Map();
let serial = 0;
const errors = [];
const summaryRequests = new Set();
const summaryResponses = [];
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Network.responseReceived" && message.params.type === "Fetch" && message.params.response.status === 200 && message.params.response.url.includes(":runQuery")) summaryRequests.add(message.params.requestId);
  if (message.method === "Network.loadingFinished" && summaryRequests.has(message.params.requestId)) {
    summaryResponses.push(send("Network.getResponseBody", { requestId: message.params.requestId }).then(result => result.body).catch(() => null));
  }
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (!message.id) return;
  const pending = requests.get(message.id);
  if (!pending) return;
  clearTimeout(pending.timer); requests.delete(message.id);
  if (message.error) pending.reject(message.error); else pending.resolve(message.result);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { requests.delete(id); reject(Error("CDP timeout: " + method)); }, 30000);
    requests.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await evaluate(expression)) return; await pause(100); }
  throw Error("UI condition failed: " + expression + "\n" + await evaluate("document.body.innerText.slice(0,1300)"));
}
async function navigate(path) {
  await evaluate(`history.pushState({}, '', ${JSON.stringify(path)}); window.dispatchEvent(new PopStateEvent('popstate'));`);
  const pathname = path.split("?")[0];
  const headings = { "/admin": ["Dashboard"], "/admin/attention": ["Attention Centre"], "/admin/search": ["Global Search"], "/admin/products": ["Products", "Product operational context"], "/admin/shop": ["Shop Control Center"], "/admin/audit": ["Audit History"], "/admin/activity": ["Recent Activity"], "/admin/chats": ["Chats", "Access unavailable"] };
  await until(`location.pathname === ${JSON.stringify(pathname)} && ${JSON.stringify(headings[pathname] || [])}.includes(document.querySelector('h1')?.textContent)`);
}
async function login(email) {
  await until("!!document.querySelector('#admin-email')");
  await evaluate("document.fonts.ready.then(()=>true)");
  await evaluate(`(() => { const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; for(const [id,value] of [['admin-email',${JSON.stringify(email)}],['admin-password',${JSON.stringify(password)}]]) { const input=document.getElementById(id);setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true})); } document.querySelector('.admin-access form').requestSubmit(); })()`);
  await until("!!document.querySelector('.admin-layout')");
}
async function inputValue(id, value) {
  await evaluate(`(() => { const input=document.getElementById(${JSON.stringify(id)}); const prototype=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
}
async function captureVisual(name) {
  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(`.tools.local/section12-visual-${name}.png`, Buffer.from(screenshot.data, "base64"));
}
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:5182/tests/section12-browser.html" });
  await until("!!document.querySelector('#admin-email')");
  await evaluate("document.fonts.ready.then(()=>true)");
  for (const width of [320, 390, 768, 900, 1024, 1280, 1440, 1920]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false, "Sign-in overflow at " + width);
    assert.equal(await evaluate("document.querySelector('.admin-password-toggle').getBoundingClientRect().width>=44"), true);
    assert.equal(await evaluate("Math.round(document.querySelector('.admin-access__brand').getBoundingClientRect().width)===Math.round(document.querySelector('.admin-access').getBoundingClientRect().width)"), width < 900, "Mobile brand band intentionally fills usable width");
    await captureVisual(`sign-in-${width}`);
  }
  await evaluate("document.querySelector('.admin-password-toggle').click()");
  assert.equal(await evaluate("document.querySelector('#admin-password').type"), "text");
  assert.equal(await evaluate("document.querySelector('.admin-password-toggle').getAttribute('aria-pressed')"), "true");
  await evaluate("document.querySelector('.admin-password-toggle').click()");
  assert.equal(await evaluate("document.querySelector('#admin-password').type"), "password");
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
  await evaluate("document.documentElement.style.fontSize='200%'");
  assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false,'Sign-in 200-percent text reflow');
  await evaluate("document.documentElement.style.fontSize=''");
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:2,mobile:false});
  await captureVisual('sign-in-high-density');
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:900,deviceScaleFactor:1,mobile:false});
  await inputValue("admin-email", "section12-broad@example.test");
  await inputValue("admin-password", "incorrect-test-password");
  await evaluate("document.querySelector('.admin-access form').requestSubmit()");
  await until("!!document.querySelector('#admin-login-error') && !document.querySelector('button[aria-busy=true]')");
  assert.equal(await evaluate("document.querySelector('#admin-password').getAttribute('aria-describedby')"), "admin-login-error");
  await captureVisual("sign-in-rejected-1920");
  await login("section12-broad@example.test");
  await until("document.querySelectorAll('.admin-source-status li').length===3 && !document.body.innerText.includes('Loading accessible')");
  await until("[...document.querySelectorAll('.admin-source-status li')].every(item=>item.innerText.includes('Checked'))");
  const summaryPayloads = (await Promise.all(summaryResponses)).filter(body => body !== null);
  assert.ok(summaryPayloads.length >= 3);
  assert.equal(summaryPayloads.some(body => /PRIVATE-CHAT-CONTENT|PRIVATE-REVIEW-CONTENT|private@example.test/.test(body)), false, "Sensitive fields leaked through a summary response");
  assert.equal(await evaluate("document.body.innerText.includes('PRIVATE-CHAT-CONTENT') || document.body.innerText.includes('private@example.test') || document.body.innerText.includes('PRIVATE-REVIEW-CONTENT')"), false);
  const responsive = [];
  for (const width of [320, 390, 768, 900, 1024, 1280, 1440, 1920]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    const layout = await evaluate(`({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,sidebar:getComputedStyle(document.querySelector('.admin-layout__sidebar')).display,rail:getComputedStyle(document.querySelector('.admin-layout__rail')).display,trigger:getComputedStyle(document.querySelector('.admin-menu-toggle')).display})`);
    assert.equal(layout.overflow, false, "Overflow at " + width);
    assert.equal(layout.sidebar !== "none", width >= 1400);
    assert.equal(layout.rail !== "none", width >= 900 && width < 1400);
    if (width < 1400) {
      await evaluate("document.querySelector('.admin-menu-toggle').click()");
      await until("document.querySelector('dialog').open");
      const dialog = await evaluate("(()=>{const d=document.querySelector('dialog'),r=d.getBoundingClientRect();return {left:r.left,height:r.height,width:r.width,focused:d.contains(document.activeElement),links:d.querySelectorAll('a').length};})()");
      assert.equal(dialog.left, 0); assert.equal(dialog.height, 900); assert.ok(dialog.focused); assert.ok(dialog.links > 4);
      if([390,768,1024].includes(width))await captureVisual(`navigation-sheet-${width}`);
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", modifiers: 8 });
      assert.equal(await evaluate("document.querySelector('dialog').contains(document.activeElement)"), true);
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await until("!document.querySelector('dialog').open");
      await until("document.activeElement.classList.contains('admin-menu-toggle')");
      layout.navigationSheet = "focus and Escape passed";
    }
    if ([390, 1024, 1440].includes(width)) {
      const screenshot = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(`.tools.local/section12-${width}.png`, Buffer.from(screenshot.data, "base64"));
    }
    responsive.push(layout);
  }
  await navigate("/admin/attention");
  await until("document.querySelectorAll('.admin-operational-card').length>=2");
  await evaluate("document.querySelector('.admin-operational-card [aria-haspopup=dialog]').click()");
  await until("document.querySelector('#attention-context')?.open && document.querySelector('#attention-context').innerText.includes('Current owner state')");
  assert.equal(await evaluate("document.querySelector('#attention-context').contains(document.activeElement)"),true);
  for(const width of [320,390,768,900,1024,1280,1440,1920]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    const overlay=await evaluate("(()=>{const d=document.querySelector('#attention-context'),r=d.getBoundingClientRect();return {width:r.width,left:r.left,right:r.right,height:r.height,usableWidth:Math.round(document.documentElement.getBoundingClientRect().width),overflow:d.scrollWidth>d.clientWidth};})()");
    assert.equal(overlay.overflow,false,'Context overlay overflow at '+width);
    assert.equal(Math.round(overlay.height),900);
    if(width<900)assert.equal(Math.round(overlay.width),overlay.usableWidth);else assert.equal(Math.round(overlay.right),overlay.usableWidth);
    if([390,1440].includes(width)){const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(`.tools.local/section12-part4-context-${width}.png`,Buffer.from(screenshot.data,'base64'));}
  }
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await until("!document.querySelector('#attention-context') && document.activeElement.textContent==='View safe context'");
  await seed(store => updateDoc(doc(store, "conversations/c1"), { lastSenderRole: "admin" }));
  await evaluate("[...document.querySelectorAll('.admin-operational-card')].find(c=>c.innerText.includes('General assistance conversation')).querySelector('button').click()");
  await until("document.body.innerText.includes('Resolved elsewhere')");
  assert.equal(await evaluate("location.pathname"), "/admin/attention");
  await navigate("/admin/search");
  await until("!!document.querySelector('#exact-reference')");
  await until("document.querySelectorAll('.admin-source-status li').length===7 && document.body.innerText.includes('Source unavailable')");
  await inputValue("operations-query", "find products named QA");
  await until("!!document.querySelector('#search-group-products') && document.querySelectorAll('.admin-operational-card').length===20");
  assert.equal(await evaluate("!!document.querySelector('#search-group-chats')"), false);
  assert.equal(await evaluate("document.querySelector('.admin-search-page').innerText.includes('p000') || document.querySelector('.admin-search-page').innerText.includes('PRIVATE-CHAT-CONTENT')"), false);
  assert.equal(await evaluate("location.search"), "");
  for (const width of [320, 390, 768, 900, 1024, 1280, 1440, 1920]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false, "Search overflow at " + width);
    if ([390, 1024, 1440].includes(width)) { const screenshot = await send("Page.captureScreenshot", { format: "png" }); await writeFile(`.tools.local/section12-part2-search-${width}.png`, Buffer.from(screenshot.data, "base64")); }
  }
  await navigate("/admin");
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "k", code: "KeyK", modifiers: 2 });
  assert.equal(await evaluate("document.activeElement.id"), "admin-shell-query");
  await inputValue("admin-shell-query", "find products named QA");
  await evaluate("document.querySelector('#admin-shell-query').closest('form').requestSubmit()");
  await until("document.querySelector('#operations-query')?.value==='find products named QA'");
  await until("document.querySelectorAll('.admin-operational-card').length===20");
  assert.equal(await evaluate("JSON.stringify(history.state).includes('find products named QA')"), false);
  await evaluate("window.section12OriginalFetch=window.fetch;window.fetch=(url,options)=>String(url).includes(':runQuery') && options?.body?.includes('\\\"collectionId\\\":\\\"reviews\\\"') ? Promise.reject(new TypeError('Synthetic isolated read outage')) : window.section12OriginalFetch(url,options)");
  await evaluate("[...document.querySelectorAll('.admin-source-status li')].find(li=>li.innerText.includes('Review & Feeds')).querySelector('button').click()");
  await until("[...document.querySelectorAll('.admin-source-status li')].some(li=>li.innerText.includes('Review & Feeds') && li.innerText.includes('Connection problem'))");
  assert.equal(await evaluate("document.querySelectorAll('.admin-operational-card').length"), 20);
  assert.equal(await evaluate("document.querySelector('#operations-query').value"), "find products named QA");
  await evaluate("window.fetch=window.section12OriginalFetch;delete window.section12OriginalFetch;[...document.querySelectorAll('.admin-source-status li')].find(li=>li.innerText.includes('Review & Feeds')).querySelector('button').click()");
  await until("[...document.querySelectorAll('.admin-source-status li')].some(li=>li.innerText.includes('Review & Feeds') && li.innerText.includes('Checked'))");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await navigate("/admin");
  await evaluate("document.querySelector('.admin-mobile-search').click()");
  await until("document.activeElement.id==='operations-query'");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelector('#exact-reference').closest('details').open=true");
  await evaluate("document.querySelector('#exact-source').value='products';document.querySelector('#exact-reference').value='p024';document.querySelector('#exact-reference').closest('form').requestSubmit()");
  await until("!!document.querySelector('#admin-field-name')");
  assert.equal(await evaluate("document.querySelector('#admin-field-name').value"), "QA Product 24");
  await evaluate("(()=>{const i=document.querySelector('#admin-field-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'QA Product corrected');i.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await evaluate("document.querySelector('#admin-field-name').closest('form').requestSubmit()");
  await until("!document.querySelector('#admin-field-name') && document.body.innerText.includes('Saved successfully')");
  for(const width of [320,390,768,900,1024,1280,1440,1920]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false,'Product owner overflow at '+width);
    assert.equal(await evaluate("document.querySelector('.admin-table-wrap').scrollWidth>document.querySelector('.admin-table-wrap').clientWidth"),false,'Critical Product horizontal scroll at '+width);
    if(width<900)assert.equal(await evaluate("document.querySelector('.admin-shop-workspace-nav').scrollWidth>document.querySelector('.admin-shop-workspace-nav').clientWidth"),false,'Owner destinations must not require horizontal swipe at '+width);
    if(width<900)assert.equal(await evaluate("[...document.querySelectorAll('.admin-product-table td')].every(cell=>!!cell.dataset.label)"),true);
    if([390,1440].includes(width)){const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(`.tools.local/section12-part4-products-${width}.png`,Buffer.from(screenshot.data,'base64'));}
  }
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"),true);
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:true});
  await evaluate("document.documentElement.style.fontSize='200%'");
  assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false,'Product 200% text reflow');
  await evaluate("document.documentElement.style.fontSize=''");
  const tableAccessibility=await send('Accessibility.getFullAXTree');
  assert.equal(tableAccessibility.nodes.some(node=>node.role?.value==='table'),true,'Transformed Product table retains accessible table semantics');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate("window.dispatchEvent(new Event('offline'))");
  await until("!document.querySelector('.admin-layout') && document.body.innerText.includes('Connection problem')");
  await evaluate("window.dispatchEvent(new Event('online'))");
  await until("!!document.querySelector('.admin-layout')");
  await evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");
  await until("!!document.querySelector('.admin-layout') && !document.body.innerText.includes('Checking your staff access')");
  let savedOperation;
  await seed(async store => { const product = (await getDoc(doc(store, "products/p024"))).data(); assert.equal(product.name, "QA Product corrected"); assert.equal(product._version, 2); savedOperation = product._lastOperationId; assert.ok((await getDoc(doc(store, "staffAudit", savedOperation))).exists()); });
  await evaluate(`import('/src/services/staffOperations.js').then(m=>m.beginStaffOperation(${JSON.stringify(uid + "/staff-studio")},'products',${JSON.stringify(savedOperation)}))`);
  await navigate("/admin/attention");
  await navigate("/admin/products");
  await until("document.body.innerText.includes('awaiting authoritative reconciliation')");
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText==='Check current owner state').click()");
  await until("document.body.innerText.includes('Current owner state loaded') && !!document.querySelector('#admin-field-name')");
  assert.equal(await evaluate("document.querySelector('#admin-field-name').value"), "QA Product corrected");
  await seed(store => updateDoc(doc(store, "products/p024"), { name: "Other staff correction", _version: 3 }));
  await evaluate("(()=>{const i=document.querySelector('#admin-field-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Stale overwrite');i.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await evaluate("document.querySelector('#admin-field-name').closest('form').requestSubmit()");
  await until("document.body.innerText.includes('changed elsewhere')");
  await seed(async store => assert.equal((await getDoc(doc(store, "products/p024"))).data().name, "Other staff correction"));
  await evaluate(`import('/src/services/staffOperations.js').then(m=>m.beginStaffOperation(${JSON.stringify(uid + "/staff-studio")},'products','missing-operation'))`);
  await navigate("/admin/attention");
  await navigate("/admin/products");
  await until("document.body.innerText.includes('awaiting authoritative reconciliation')");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText==='Add product').disabled"), true);
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText==='Check current owner state').click()");
  await until("document.body.innerText.includes('outcome remains unresolved')");
  assert.equal(await evaluate("!!document.querySelector('#admin-field-name')"), false);
  await evaluate(`import('/src/services/staffOperations.js').then(m=>m.clearStaffOperation(${JSON.stringify(uid + "/staff-studio")},'products','missing-operation'))`);
  await navigate("/admin/audit");
  await until("document.body.innerText.includes('Human actor: staff-studio')");
  await navigate("/admin");
  await until("document.querySelector('[data-metric=products] strong')?.textContent==='1'");
  await evaluate("document.querySelector('[data-metric=products] a').click()");
  await until("document.querySelector('#operations-category')?.value==='products' && document.querySelectorAll('.admin-operational-card').length===1");
  await evaluate("document.querySelector('.admin-operational-card button').click()");
  await until("!!document.querySelector('#admin-field-unitLabel') && location.search.includes('issue=unit')");
  await inputValue("admin-field-unitLabel", "per piece");
  await evaluate("document.querySelector('#admin-field-unitLabel').closest('form').requestSubmit()");
  await until("document.body.innerText.includes('Saved successfully') && !document.querySelector('#admin-field-unitLabel')");
  await navigate("/admin");
  await until("document.querySelector('[data-metric=products] strong')?.textContent==='0'");
  await navigate("/admin/products?edit=p000&issue=unit");
  await until("document.body.innerText.includes('Status changed since this issue link was created')");
  await navigate('/admin/products?edit=p024');
  await until("document.querySelector('#admin-field-name')?.value==='Other staff correction'");
  await navigate('/admin/products?edit=p000');
  await until("document.querySelector('#admin-field-name')?.value==='QA Product 0'");
  await navigate('/admin/products?edit=p024');
  await until("document.querySelector('#admin-field-name')?.value==='Other staff correction'");
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText==='Archive').click()");
  await until("document.querySelector('.admin-confirm-dialog')?.open");
  assert.equal(await evaluate("document.querySelector('.admin-confirm-dialog').contains(document.activeElement)"),true);
  await evaluate("[...document.querySelectorAll('.admin-confirm-dialog button')].find(button=>button.innerText==='Cancel action').click()");
  await until("!document.querySelector('.admin-confirm-dialog')");
  await seed(async store=>assert.equal((await getDoc(doc(store,'products/p024'))).data().status,'draft'));
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText==='Archive').click()");
  await until("document.querySelector('.admin-confirm-dialog')?.open");
  await evaluate("[...document.querySelectorAll('.admin-confirm-dialog button')].find(button=>button.innerText==='Confirm action').click()");
  await until("document.body.innerText.includes('Product archived. Its record is retained') && !document.querySelector('#admin-field-name')");
  await navigate("/admin/activity");
  await until("!!document.querySelector('#activity-scope') && document.body.innerText.includes('Checked')");
  for(let page=0;page<4 && !(await evaluate("document.querySelector('.admin-activity-list').innerText.includes('Product archived')"));page++) {
    await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText==='Load more eligible events')?.click()");
    await until("!document.querySelector('button[aria-busy=true]')");
  }
  await until("document.querySelector('.admin-activity-list').innerText.includes('Product archived')");
  assert.equal(await evaluate("document.querySelector('.admin-activity-list').innerText.includes('PRIVATE') || document.querySelector('.admin-activity-list').innerText.includes('p024') || document.querySelector('.admin-activity-list').innerText.includes('save')"), false);
  assert.equal(await evaluate("document.querySelector('.admin-activity-list').innerText.includes('You (Staff)')"), true);
  for (const width of [320,390,768,900,1024,1280,1440,1920]) {
    await send("Emulation.setDeviceMetricsOverride", {width,height:900,deviceScaleFactor:1,mobile:width<768});
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false,"Activity overflow at "+width);
    if([390,1440].includes(width)){const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(`.tools.local/section12-part3-activity-${width}.png`,Buffer.from(screenshot.data,'base64'));}
  }
  await evaluate("document.querySelector('.admin-activity-list button').click()");
  await until("location.pathname==='/admin/products' && location.search.includes('edit=p024') && document.body.innerText.includes('Archived')");
  await navigate("/admin/search");
  await until("document.querySelector('[aria-labelledby=recent-entities-heading]').innerText.includes('Other staff correction')");
  await navigate("/admin/chats?conversation=c1");
  await until("!!document.querySelector('#chat-message') && document.querySelector('.conversation__history').getAttribute('aria-busy')==='false'");
  for (const width of [320, 390, 768, 900, 1024, 1280, 1440, 1920]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false, "Chat overflow at " + width);
    assert.equal(await evaluate("!!document.querySelector('#chat-message') && document.querySelector('#chat-message').getBoundingClientRect().width>0"), true);
  }
  await inputValue("chat-message", "Part 2 confirmed logical send");
  await until("!document.querySelector('.conversation__composer button[type=submit]').disabled");
  await evaluate("document.querySelector('.conversation__composer').requestSubmit()");
  await until("document.querySelector('#chat-message').value==='' && document.body.innerText.includes('Part 2 confirmed logical send')");
  let sentMessage;
  await seed(async store => { const parent = (await getDoc(doc(store, "conversations/c1"))).data(); sentMessage = parent.lastMessageId; assert.equal((await getDoc(doc(store, "staffAudit", sentMessage))).data().actorStaffId, "staff-studio"); });
  await evaluate(`import('/src/services/staffOperations.js').then(m=>m.beginStaffOperation(${JSON.stringify(uid + "/staff-studio")},'chat:c1',${JSON.stringify(sentMessage)}))`);
  await navigate("/admin/search"); await navigate("/admin/chats?conversation=c1");
  await until("document.body.innerText.includes('previous send is awaiting authoritative reconciliation')");
  assert.equal(await evaluate("document.querySelector('.conversation__composer button[type=submit]').disabled"), true);
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText==='Check send result').click()");
  await until("!document.body.innerText.includes('previous send is awaiting authoritative reconciliation')");
  await evaluate(`import('/src/services/staffOperations.js').then(m=>m.beginStaffOperation(${JSON.stringify(uid + "/staff-studio")},'chat:c1','unknown-logical-message'))`);
  await navigate("/admin/search"); await navigate("/admin/chats?conversation=c1");
  await until("document.body.innerText.includes('previous send is awaiting authoritative reconciliation')");
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText==='Check send result').click()");
  await until("document.body.innerText.includes('result remains unresolved')");
  await seed(async store => assert.equal((await getDoc(doc(store, "conversations/c1"))).data().lastMessageId, sentMessage));
  await evaluate(`import('/src/services/staffOperations.js').then(m=>m.clearStaffOperation(${JSON.stringify(uid + "/staff-studio")},'chat:c1','unknown-logical-message'))`);
  await seed(store => updateDoc(doc(store, "admins", uid), { active: false }));
  await until("document.body.innerText.includes('Staff access unavailable') && !document.querySelector('.admin-layout')");
  assert.equal(await evaluate("document.querySelector('.admin-access').dataset.entryState"),'inactive');
  for(const width of [390,768,1440]) { await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768}); await captureVisual(`access-restricted-${width}`); }
  await seed(store => updateDoc(doc(store, "admins", uid), { active: true }));
  await until("!!document.querySelector('.admin-layout')");
  await evaluate("import('/src/firebase/auth.js').then(m=>m.signOutUser())");
  await until("!!document.querySelector('#admin-email')");
  await login("section12-narrow@example.test");
  await navigate('/admin/products?edit=p000');
  await until("document.body.innerText.includes('Current access does not permit this context')");
  await captureVisual("destination-denied-1440");
  assert.equal(await evaluate("!!document.querySelector('#admin-field-name')"),false);
  await navigate('/admin/shop');
  await until("!document.body.innerText.includes('Loading Shop operations') && document.body.innerText.includes('Some owner sources are unavailable or restricted')");
  assert.equal(await evaluate("document.body.innerText.includes('No catalogue issues were found in the checked owner page') && !document.body.innerText.includes('Current Product page unavailable')"),true,'Verified scoped Product page survives aggregate-source denial');
  assert.equal(await evaluate("!!document.querySelector('a[href=\"/admin/discovery\"]') || !!document.querySelector('a[href=\"/admin/taxonomy\"]')"),false,'Inaccessible content workspace links are absent');
  await navigate("/admin/activity");
  await until("document.body.innerText.includes('Event source unavailable for current access')");
  assert.equal(await evaluate("!!document.querySelector('#activity-scope') || document.body.innerText.includes('Product archived')"),false);
  await evaluate("import('/src/firebase/auth.js').then(m=>m.signOutUser())");
  await until("!!document.querySelector('#admin-email')");
  await login("section12-activity@example.test");
  await navigate("/admin/activity");
  await until("document.body.innerText.includes('Checked')");
  for(let page=0;page<4 && !(await evaluate("document.querySelector('.admin-activity-list').innerText.includes('Product restored')"));page++){
    await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText==='Load more eligible events')?.click()");
    await until("!document.querySelector('button[aria-busy=true]')");
  }
  await until("document.querySelectorAll('.admin-activity-list li').length===1 && ![...document.querySelectorAll('button')].some(button=>button.innerText==='Load more eligible events')");
  assert.equal(await evaluate("!!document.querySelector('#activity-scope')"),false);
  await navigate("/admin");
  await until("!!document.querySelector('#quick-access')");
  assert.equal(await evaluate("document.querySelector('.admin-layout__sidebar').innerText.includes('Chats')"), false);
  assert.equal(await evaluate("document.body.innerText.includes('staff-studio')"), false);
  await navigate("/admin/chats?conversation=c1");
  await until("document.body.innerText.includes('Access unavailable')");
  assert.equal(await evaluate("document.body.innerText.includes('PRIVATE-CHAT-CONTENT')"), false);
  await evaluate("import('/src/firebase/auth.js').then(m=>m.signOutUser())");
  await until("!!document.querySelector('#admin-email')");
  await seed(store => updateDoc(doc(store, "conversations/c1"), { assignedStaffId: "staff-assigned" }));
  await login("section12-assigned@example.test");
  await navigate("/admin/chats?conversation=c1");
  await until("!!document.querySelector('#chat-message') && document.body.innerText.includes('Part 2 confirmed logical send')");
  await seed(store => updateDoc(doc(store, "conversations/c1"), { assignedStaffId: "another-staff" }));
  await until("!document.querySelector('#chat-message') && !document.body.innerText.includes('Part 2 confirmed logical send')");
  await seed(async store => assert.equal((await getDoc(doc(store, "conversations", "c1", "messages", sentMessage))).data().senderId, uid));
  await evaluate("import('/src/firebase/auth.js').then(m=>m.signOutUser())");
  await until("!!document.querySelector('#admin-email')");
  await login("section12-minimum@example.test");
  await navigate("/admin");
  await until("document.body.innerText.includes('Minimum staff experience')");
  await captureVisual("minimum-staff-1440");
  assert.equal(await evaluate("!!document.querySelector('.admin-source-status li')"), false);
  await evaluate("(()=>{const frame=document.createElement('iframe');frame.id='private-frame-qa';frame.src='/tests/section12-browser.html';document.body.append(frame);})()");
  await until("document.querySelector('#private-frame-qa')?.contentDocument?.body?.innerText.includes('Open the private workspace in its own window')");
  assert.equal(await evaluate("!!document.querySelector('#private-frame-qa').contentDocument.querySelector('.admin-layout')"),false);
  await evaluate("document.querySelector('#private-frame-qa').remove()");
  await evaluate("import('/src/firebase/auth.js').then(m=>m.signOutUser())");
  await until("!!document.querySelector('#admin-email')");
  await inputValue('admin-email','section12-unresolved@example.test'); await inputValue('admin-password',password);
  await evaluate("document.querySelector('.admin-access form').requestSubmit()");
  await until("document.querySelector('.admin-access')?.dataset.entryState==='unresolved'");
  assert.equal(await evaluate("!!document.querySelector('.admin-layout')"),false);
  assert.equal(await evaluate("document.body.innerText.includes('contact internal support')"),false);
  for(const width of [390,768,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});await captureVisual(`actor-unresolved-${width}`);}
  await send("Page.navigate", { url: "http://127.0.0.1:5182/tests/section12-visual-states.html" });
  await until("document.querySelectorAll('[data-operational-state]').length===23");
  for(const width of [320,390,768,900,1024,1280,1440,1920]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false,'State family overflow at '+width);
    assert.equal(await evaluate("[...document.querySelectorAll('.admin-state')].some(item=>item.scrollWidth>item.clientWidth)"),false,'State card overflow at '+width);
    if([390,768,1440].includes(width))await captureVisual(`states-${width}`);
  }
  assert.equal(await evaluate("!!document.querySelector('[data-operational-state=unknown-result] button')"),false,'Unknown result has no generic Retry');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.admin-state--checking .admin-state__icon')).animationName"),'none');
  await send('Emulation.setEmulatedMedia',{features:[]});
  assert.deepEqual(errors, []);
  const fonts=await evaluate("[...document.fonts].map(font=>({family:font.family,status:font.status}))");
  await writeFile('.tools.local/section12-visual-browser-result.json',JSON.stringify({viewports:[320,390,768,900,1024,1280,1440,1920],signIn:"reveal, safe real authentication rejection, no overflow, 200% text",states:23,reducedMotion:true,fonts,runtimeExceptions:errors.length,backedRegressionJourneys:35},null,2));
  console.log(JSON.stringify({ responsive, journeys: ["real staff sign-in", "no private summary payload leakage", "keyboard navigation sheet", "current Attention context drawer/mobile sheet/focus/Escape", "eight-width owner cards and 200-percent text reflow", "accessible table semantics", "offline private withdrawal and online/BFCache recheck", "same-route exact owner target replacement", "confirmation cancel no-write and confirmed Archive receipt", "scoped owner-overview partial survival/no CMS ghosts", "framed private workspace denial", "resolved elsewhere without duplicate work", "Search grouping and masking", "Search eight-width reflow", "desktop shortcut and mobile full-screen entry", "independent unavailable owner sources", "exact reference beyond first page", "current-authorized recent entities", "Product save and atomic Audit", "Product issue metric to owner correction to reconciled metric", "stale Product issue link shows current context", "Product lifecycle receipt to event-only Activity to current owner", "eight-width Activity reflow", "narrow Activity scopes source objects before retrieval", "reopened committed-operation reconciliation", "same-timestamp stale-version rejection", "unresolved operation blocks duplicate save", "General Chat send and durable actor receipt", "reopened committed Chat result", "unknown Chat result blocks duplication", "assignment transfer removes stale private context and preserves authorship", "revocation", "account switch", "denied deep link", "minimum staff experience"], runtimeExceptions: errors.length }));
} finally { socket.close(); await env.cleanup(); }
