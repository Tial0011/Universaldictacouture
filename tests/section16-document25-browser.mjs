import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import sharp from 'sharp';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8089';process.env.METADATA_SERVER_DETECTION='none';
const origin='http://127.0.0.1:5182',app=initializeApp({projectId:'demo-udc-section12'},'d25-browser-'+randomUUID()),auth=getAuth(app),db=getFirestore(app),password='Document25-Native-Password!';
const staffUid=randomUUID(),staffId=randomUUID(),staffEmail=`d25-staff-${staffUid}@example.test`;
await auth.createUser({uid:staffUid,email:staffEmail,password,emailVerified:true});
await db.doc('staffIdentities/'+staffId).set({staffId,principalUid:staffUid,active:true});
await db.doc('admins/'+staffUid).set({staffId,active:true,capabilities:Object.fromEntries(['read','save-working','establish-edition','business-approve','enable-payment'].map(action=>['orders.'+action,{domainWide:{active:true,purpose:'order-operations'}}]))});
const login=await(await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-test-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:staffEmail,password,returnSecureToken:true})})).json();assert.ok(login.idToken);let cookie;
async function api(action,input={},read=false){const url=new URL('/.netlify/functions/account',origin);url.searchParams.set('action',action);if(read)for(const[key,value]of Object.entries(input))url.searchParams.set(key,value);const response=await fetch(url,{method:read?'GET':'POST',headers:{Origin:origin,Authorization:'Bearer '+login.idToken,...(cookie?{Cookie:cookie}:{}),...(!read?{'Content-Type':'application/json'}:{})},...(!read?{body:JSON.stringify(input)}:{})});const value=await response.json();if(action==='session-start')cookie=response.headers.get('set-cookie')?.split(';')[0];assert.equal(response.ok,true,action+': '+JSON.stringify(value));return value;}
await api('session-start',{kind:'staff',keepSignedIn:false,label:'Document25 isolated Staff fixture'});
const target=(await(await fetch('http://127.0.0.1:9228/json')).json()).find(page=>page.type==='page'),ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;const pending=new Map(),exceptions=[],dialogs=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error(method+' deadline')),30000)});ws.send(JSON.stringify({id,method,params}));});
ws.onmessage=({data})=>{const message=JSON.parse(data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);if(message.method==='Page.javascriptDialogOpening'){dialogs.push(message.params.type);void send('Page.handleJavaScriptDialog',{accept:true});}const request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);if(message.error)request.reject(Error(message.error.message));else request.resolve(message.result);}};
async function evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;}
async function until(expression){for(let index=0;index<250;index++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Not reached '+expression+'\n'+await evaluate('document.body.innerText.slice(0,1600)'));}
async function input(id,value,textarea=false){await evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(${textarea?'HTMLTextAreaElement':'HTMLInputElement'}.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function navigate(path){await evaluate(`history.pushState({},'',${JSON.stringify(path)});dispatchEvent(new PopStateEvent('popstate'));`);}
async function click(text){await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(el=>el.textContent===${JSON.stringify(text)});button.focus();button.click();})()`);}
async function signup(){await navigate('/signup');await until("!!document.getElementById('auth-confirm')");await input('auth-email',`d25-native-${randomUUID()}@example.test`);await input('auth-password',password);await input('auth-confirm',password);await evaluate("document.querySelector('.auth-flow__form').requestSubmit()");await until("location.pathname==='/verify-email'");}
let orderId;
async function commercial(action,extra={}){const current=await api('staff-order',{orderId},true),work=(await db.doc(`orders/${orderId}/work/base`).get()).data();return api('staff-commercial',{orderId,componentId:'base',expectedVersion:current.version,expectedEdition:current.currentEdition,expectedWorkingVersion:work.workingVersion,action,operationId:randomUUID(),...extra});}
const tag=randomUUID().slice(0,8),privateDraft='PRIVATE D25 ACCOUNT A '+tag,privateOrder='Private Document 25 Order '+tag;
try{
  await send('Page.enable');await send('Runtime.enable');await send('Accessibility.enable');
  await evaluate("import('/src/firebase/auth.js').then(async m=>{if(m.auth.currentUser)await m.signOutUser()})");
  await send('Page.navigate',{url:origin+'/tests/section11-browser.html?route=/signup'});await until("!!document.getElementById('auth-confirm')");
  await signup();await navigate('/custom-style');await until("!!document.getElementById('custom-idea')");await input('custom-idea',privateDraft,true);
  await evaluate("import('/src/firebase/auth.js').then(m=>m.signOutUser())");await until("document.getElementById('custom-idea')?.value===''");
  assert.ok(!JSON.stringify(await send('Accessibility.getFullAXTree')).includes(privateDraft));
  await signup();await navigate('/custom-style');await until("!!document.getElementById('custom-idea')");assert.equal(await evaluate("document.getElementById('custom-idea').value"),'');
  const created=await evaluate("import('/src/services/accountApi.js').then(async m=>{const current=await m.accountRequest('context');const request=await m.accountRequest('custom-style-save',{operationId:crypto.randomUUID(),expectedEpoch:current.epoch,expectedVersion:0,fields:{notes:'Document25 runtime fixture'}});return m.accountRequest('custom-style-handoff',{operationId:crypto.randomUUID(),requestId:request.requestId,expectedVersion:request.version,expectedEpoch:current.epoch})})");orderId=created.orderId;
  await commercial('save-working',{terms:{entries:[{label:privateOrder,quantity:1,unitAmountMinor:100000}],amountDueNowMinor:100000}});await commercial('establish-edition');await commercial('business-approve');
  await navigate('/my-closet/orders/'+orderId);await until("document.body.innerText.includes("+JSON.stringify(privateOrder)+")");
  // Hold a legitimate read: old private DOM and accessibility content must go,
  // while the same focusable recovery control remains in place.
  await evaluate("window.d25RealFetch=window.fetch.bind(window);window.d25HoldRead=true;window.fetch=async(...args)=>{const action=new URL(String(args[0]),location.origin).searchParams.get('action');if(action==='order'&&window.d25HoldRead){window.d25HoldRead=false;await new Promise(resolve=>window.d25ReleaseRead=resolve);}return window.d25RealFetch(...args);}");
  await click('Check current Order');await until("!!window.d25ReleaseRead");assert.equal(await evaluate('document.body.innerText.includes('+JSON.stringify(privateOrder)+')'),false);assert.ok(!JSON.stringify(await send('Accessibility.getFullAXTree')).includes(privateOrder));
  assert.equal(await evaluate("document.activeElement?.textContent"),'Check current Order');await evaluate('window.d25ReleaseRead();window.fetch=window.d25RealFetch');await until('document.body.innerText.includes('+JSON.stringify(privateOrder)+')');
  await click('Approve current Edition');await until("![...document.querySelectorAll('button')].some(el=>el.textContent==='Approve current Edition')");assert.ok(dialogs.includes('confirm'));
  await commercial('enable-payment');await click('Check current Order');await until("!!document.getElementById('receipt-file')");
  await input('receipt-amount','1000');const proofPath=new URL('../.tools.local/section16-document25-proof.png',import.meta.url);await sharp({create:{width:8,height:8,channels:3,background:'#bd9b67'}}).png().toFile(decodeURIComponent(proofPath.pathname.replace(/^\//,'')));
  const root=await send('DOM.getDocument'),file=await send('DOM.querySelector',{nodeId:root.root.nodeId,selector:'#receipt-file'});await send('DOM.setFileInputFiles',{nodeId:file.nodeId,files:[decodeURIComponent(proofPath.pathname.replace(/^\//,''))]});
  // The real backend commits upload, then only its acknowledgement is lost.
  await evaluate("window.d25RealFetch=window.fetch.bind(window);window.d25LoseUpload=true;window.fetch=async(...args)=>{const response=await window.d25RealFetch(...args);if(new URL(String(args[0]),location.origin).searchParams.get('action')==='media-stage'&&window.d25LoseUpload){window.d25LoseUpload=false;await response.clone().arrayBuffer();throw new DOMException('Synthetic acknowledgement loss','AbortError');}return response;}");
  await evaluate("document.querySelector('section[aria-label=\"Bank Transfer evidence\"] form').requestSubmit()");await until("!![...document.querySelectorAll('button')].find(el=>el.textContent==='Check evidence outcome')");
  assert.equal((await db.collection('payments').where('orderId','==',orderId).get()).size,0);await evaluate('window.fetch=window.d25RealFetch');await click('Check evidence outcome');await until("!![...document.querySelectorAll('button')].find(el=>el.textContent==='Continue this receipt')");
  assert.equal((await db.collection('payments').where('orderId','==',orderId).get()).size,0);await click('Continue this receipt');await until("document.body.innerText.includes('Receipt Submitted')");assert.equal((await db.collection('payments').where('orderId','==',orderId).get()).size,1);
  await until('document.body.innerText.includes('+JSON.stringify(privateOrder)+')');
  await evaluate("window.dispatchEvent(new Event('udc:account:authority-uncertain'))");await until('!document.body.innerText.includes('+JSON.stringify(privateOrder)+')');assert.ok(!JSON.stringify(await send('Accessibility.getFullAXTree')).includes(privateOrder));
  const status=await evaluate("[...document.querySelectorAll('[data-source-state],[role=status],[role=alert]')].map(el=>({role:el.getAttribute('role'),live:el.getAttribute('aria-live')||(el.getAttribute('role')==='status'?'polite':el.getAttribute('role')==='alert'?'assertive':null),text:el.textContent}))");assert.ok(status.some(row=>row.live&&row.text));
  await until("!![...document.querySelectorAll('button')].find(el=>el.textContent==='Check current Order')");await click('Check current Order');await until('document.body.innerText.includes('+JSON.stringify(privateOrder)+')');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const width of[320,390,768,1024,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'Reflow '+width);}
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await evaluate("document.body.style.zoom='2'");assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'CSS 200% zoom');await evaluate("document.body.style.zoom=''");
  const controls=await evaluate("[...document.querySelectorAll('button')].filter(el=>el.textContent==='Check current Order').map(el=>({height:el.getBoundingClientRect().height,disabled:el.disabled}))");assert.ok(controls.every(row=>row.height>=44&&!row.disabled));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await evaluate('document.activeElement!==document.body'),true);
  assert.deepEqual(exceptions,[]);
  await writeFile('.tools.local/section16-document25-browser-result.json',JSON.stringify({passed:true,privateDraftClearedAfterSignOut:true,accountBDoesNotReceiveDraftA:true,readCheckingRemovesPrivateDomAndAx:true,readRecoveryFocusRetained:true,nativeConfirmationDialog:true,uploadAckLossRecoveredWithoutReupload:true,noPaymentBeforeExplicitContinuation:true,oneOriginalPaymentEffect:true,authorityShieldRemovesPrivateDomAndAx:true,statusLiveRegions:true,widths:[320,390,768,1024,1440],cssZoom200:true,reducedMotion:true,touchTargets44:true,keyboardTab:true,runtimeExceptions:exceptions,productionTested:false},null,2));
  console.log('Document25 native privacy/unknown-upload recovery/focus/status/reflow checks passed.');
}finally{ws.close();await db.terminate();await deleteApp(app);}
