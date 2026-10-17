import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createAccountService } from '../netlify/lib/account-service.js';
import { createTaxonomyGovernance } from '../netlify/lib/taxonomy-governance.js';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'; process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8089'; process.env.METADATA_SERVER_DETECTION='none';
const origin='http://127.0.0.1:5182',id=()=>randomUUID(),password='Section15-Integrity-QA-Only!';
const app=initializeApp({projectId:'demo-udc-section12'},'integrity-browser-'+id()),db=getFirestore(app),auth=getAuth(app),account=createAccountService({db,auth,secret:'local-section16-qa-only-secret-not-production'}),_taxonomy=createTaxonomyGovernance(account);
const uid=id(),staffId=id(),email='s15-integrity-'+uid+'@example.test',_claims={uid,kind:'staff',auth_time:Math.floor(Date.now()/1000)};
const capabilities={}; for(const action of ['read','edit']){capabilities['settings.bank.'+action]={governance:{active:true,purpose:'financial-settings',area:'financial-settings',ids:['bank-transfer']}};capabilities['settings.taxonomy.'+action]={domainWide:{active:true,purpose:'taxonomy-settings'}};capabilities['settings.templates.'+action]={domainWide:{active:true,purpose:'communication-settings'}};}
capabilities['notifications.read']={selectedObject:{active:true,purpose:'personal-notifications',ids:[staffId]}};
await auth.createUser({uid,email,password,emailVerified:true}); await db.doc('admins/'+uid).set({staffId,active:true,displayName:'Integrity QA Staff',capabilities});await db.doc('staffIdentities/'+staffId).set({staffId,principalUid:uid,active:true});
await mkdir('.tools.local/section15-part4-reference',{recursive:true});
const target=(await(await fetch('http://127.0.0.1:9228/json')).json()).find(tab=>tab.type==='page');assert.ok(target);const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let serial=0;const pending=new Map(),errors=[];
socket.onmessage=({data})=>{const message=JSON.parse(data);if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);const request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);if(message.error)request.reject(Error(message.error.message));else request.resolve(message.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++serial;pending.set(requestId,{resolve,reject,timer:setTimeout(()=>reject(Error(method+' timed out')),30000)});socket.send(JSON.stringify({id:requestId,method,params}));});
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function until(expression){for(let n=0;n<250;n++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Not reached: '+expression+'\n'+await evaluate('document.body.innerText.slice(0,2000)'));}
async function navigate(path){await evaluate(`history.pushState({},'',${JSON.stringify(path)});dispatchEvent(new PopStateEvent('popstate'));`);}
async function input(selector,value,textarea=false){await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing input');Object.getOwnPropertyDescriptor(${textarea?'HTMLTextAreaElement':'HTMLInputElement'}.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function screenshot(name){const capture=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`.tools.local/section15-part4-reference/runtime-${name}.png`,Buffer.from(capture.data,'base64'));}


try{
await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
await send('Page.navigate',{url:origin+'/tests/section11-browser.html?route=/admin'});await until("!!document.querySelector('#admin-email')");await input('#admin-email',email);await input('#admin-password',password);await evaluate("document.querySelector('.admin-access form').requestSubmit()");await until("!!document.querySelector('.admin-layout')");
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await send('Network.emulateNetworkConditions',{offline:false,latency:400,downloadThroughput:16384,uploadThroughput:16384,connectionType:'cellular3g'});
await navigate('/admin/settings/bank');await until("document.body.innerText.includes('Protected values masked')");assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await evaluate("dispatchEvent(new Event('offline'))");await until("!document.body.innerText.includes('Protected values masked')");assert.equal(await evaluate("!!document.querySelector('#bank-accountNumber')"),false);assert.equal(await evaluate("!!document.querySelector('[data-semantic-state=EMPTY]')"),false);
await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await evaluate("dispatchEvent(new Event('online'))");await until("document.body.innerText.includes('Protected values masked')");await screenshot('bank-network-recovered-390');
assert.deepEqual(errors,[]);await writeFile('.tools.local/section15-part4-reference/network-result.json',JSON.stringify({lowBandwidth:{latencyMs:400,bytesPerSecond:16384},protectedDisclosureWithdrawnOffline:true,noFalseEmpty:true,reconnectAuthoritativeRead:true,width:390,productionTested:false},null,2));console.log('PASS: 400ms/16KiB network, offline withdrawal, no false empty and authoritative reconnect.');
}finally{socket.close();await db.terminate();await deleteApp(app);}
