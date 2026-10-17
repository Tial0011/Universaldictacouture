import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {createExistingAccountRepair} from '../netlify/lib/existing-account-repair.js';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8089';process.env.METADATA_SERVER_DETECTION='none';
const projectId='demo-udc-section12',origin='http://127.0.0.1:5182',password='Local-Account-Repair-Only!';
const app=initializeApp({projectId},'repair-browser-'+randomUUID()),db=getFirestore(app),auth=getAuth(app);
const rules=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8089,rules:await readFile('firestore.rules','utf8')}});
const repair=createExistingAccountRepair({db,auth,secret:'local-section16-qa-only-secret-not-production'}),people=[];
for(const [name,admin,owner]of [['Repair Owner A',true,true],['Repair Owner B',true,true],['Repair Admin',true,false],['Repair Customer',false,false]]){
  const uid='000-'+randomUUID(),email=`${uid}@example.test`;await auth.createUser({uid,email,password,emailVerified:true});
  await db.doc('customerProfiles/'+uid).set({fullName:name,phoneNumber:'0000000000'});
  const displayName=name+' '+uid.slice(-6);
  if(admin)await db.doc('admins/'+uid).set({active:true,role:'Admin',displayName});
  await repair.customer(uid,{commit:true});if(admin)await repair.admin(uid,{commit:true,owner,paymentReview:true});people.push({uid,email,name:displayName});
}
const productId=randomUUID(),productName='Repair QA Published Aso Oke';
await db.doc('products/'+productId).set({_ownerVersion:2,_version:1,publicVersion:1,status:'published',publishedAt:Date.now(),publicRepresentation:{name:productName,price:2000,unitLabel:'per piece',category:['Fabric'],isNewIn:true,images:[{url:'https://example.test/public-fixture.jpg'}]}});
const target=(await(await fetch('http://127.0.0.1:9228/json')).json()).find(tab=>tab.type==='page');assert.ok(target);
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let serial=0;const pending=new Map(),exceptions=[];
socket.onmessage=({data})=>{const message=JSON.parse(data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);const call=pending.get(message.id);if(call){pending.delete(message.id);clearTimeout(call.timer);if(message.error)call.reject(Error(message.error.message));else call.resolve(message.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error(method+' timed out')),30000)});socket.send(JSON.stringify({id,method,params}));});
async function evaluate(expression){const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;}
async function until(expression){for(let i=0;i<200;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(expression+'\n'+await evaluate('document.body.innerText.slice(0,1300)'));}
async function navigate(path){await evaluate(`history.pushState({},'',${JSON.stringify(path)});dispatchEvent(new PopStateEvent('popstate'));`);}
async function click(text){await evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getClientRects().length&&!e.disabled);if(!b)throw Error('Missing control');b.focus();b.click();})()`);}
async function signIn(person){await navigate('/admin');await until("!!document.querySelector('#admin-email')");for(const [selector,value]of [['#admin-email',person.email],['#admin-password',password]])await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await evaluate("document.querySelector('.admin-access form').requestSubmit()");}
async function signOut(){await evaluate("(async()=>{const {signOutUser}=await import('/src/firebase/auth.js');await signOutUser();})()");}
async function toggleProducts(enabled){await until(`document.body.innerText.includes('Admin permissions')&&document.body.innerText.includes(${JSON.stringify(people[2].name)})`);await evaluate(`(()=>{const s=[...document.querySelectorAll('section.admin-panel')].find(e=>e.querySelector('h2')?.textContent===${JSON.stringify(people[2].name)});s.querySelector('details').open=true;const l=[...s.querySelectorAll('label')].find(e=>e.textContent.trim()==='products · publish');if(l.querySelector('input').checked===${enabled})throw Error('Unexpected prior permission');l.querySelector('input').click();})()`);await until("!!document.querySelector('dialog[open]')");assert.equal(await evaluate("document.activeElement.textContent.trim()"),'Cancel action');await click('Confirm action');await until("document.body.innerText.includes('Access change confirmed')");}
try{
  await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:origin+'/tests/section11-browser.html?route=/admin'});
  await until("!!document.querySelector('#admin-email')");
  await signIn(people[0]);await until("!!document.querySelector('.admin-workspace')");
  await navigate('/admin/settings');await until("document.body.innerText.includes('Manage admin permissions')");await click('Manage admin permissions');await toggleProducts(false);
  assert.ok((await db.doc('admins/'+people[2].uid).get()).data().disabledCapabilities.includes('products.publish'));
  await mkdir('.tools.local/account-repair',{recursive:true});
  for(const width of [320,768,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'owner permissions overflow '+width);const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(`.tools.local/account-repair/owners-${width}.png`,Buffer.from(screenshot.data,'base64'));}
  await evaluate("document.documentElement.style.zoom='2'");assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await evaluate("document.documentElement.style.zoom='1'");
  await signOut();await signIn(people[1]);await until("!!document.querySelector('.admin-workspace')");await navigate('/admin/settings/admins');await toggleProducts(true);
  await navigate('/shop');await until(`document.body.innerText.includes(${JSON.stringify(productName)})`);
  await navigate('/');await until(`document.body.innerText.includes(${JSON.stringify(productName)})`);
  await navigate('/profile');await until("document.body.innerText.includes('Your account is connected')");
  await navigate('/profile?area=personal');await until("document.querySelector('#profile-fullName')?.value==='Repair Owner B'&&!document.querySelector('#profile-fullName').disabled");
  await evaluate("(()=>{const e=document.querySelector('#profile-preferredName');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Current Owner');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  // Commit reaches the real local handler, but the browser loses the reply.
  await evaluate("(()=>{const original=window.fetch;window.fetch=async(...args)=>{const response=await original(...args);if(String(args[0]).includes('action=profile-save')){window.fetch=original;await response.text();throw new TypeError('Local test: acknowledgement lost');}return response;};})()");
  await click('Save Changes');await until("document.body.innerText.includes('Save outcome unconfirmed')");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Save Changes').disabled"),true);
  await click('Check save result');await until("document.body.innerText.includes('confirmed from the account record')");
  await click('Reload current details');await until("document.querySelector('#profile-preferredName')?.value==='Current Owner'&&!document.querySelector('#profile-preferredName').disabled");
  await navigate('/custom-style');await until("!!document.querySelector('#custom-idea')");
  await evaluate("(()=>{const e=document.querySelector('#custom-idea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Local repair test: traditional Aso Oke');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await click('Save Custom Style request');await until("document.body.innerText.includes('Your Custom Style request is saved')");
  await signOut();await signIn(people[2]);await until("!!document.querySelector('.admin-workspace')");await navigate('/admin/settings/admins');await until("document.body.innerText.includes('Owner access required')");
  await signOut();await signIn(people[3]);await until("document.body.innerText.includes('Staff access unavailable')");await navigate('/profile?area=personal');await until("document.querySelector('#profile-fullName')?.value==='Repair Customer'&&!document.querySelector('#profile-fullName').disabled");
  assert.equal(await evaluate("document.querySelector('#profile-preferredName').value"),'');
  await navigate('/shop');await until(`document.body.innerText.includes(${JSON.stringify(productName)})`);
  assert.deepEqual(exceptions,[]);console.log('PASS: both owners independently change permissions; non-owner denied; existing customer/admin sign-in; customer isolation; Shop/New In/Profile/Custom Style; 320/768/1440px and 200% reflow; no runtime exceptions.');
}finally{socket.close();await rules.cleanup();await db.terminate();await deleteApp(app);}
