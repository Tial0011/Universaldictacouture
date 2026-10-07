import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc} from 'firebase/firestore';
import {studioStaff,legacyDevelopmentAdmin} from './staff-fixtures.mjs';
const project='demo-udc-section12',password='Admin-Compatibility-QA-Only!';
async function account(name){const email=name+'@example.test',endpoint='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:';let response=await fetch(endpoint+'signUp?key=local-test-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});if(!response.ok)response=await fetch(endpoint+'signInWithPassword?key=local-test-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});assert.ok(response.ok);return {email,...await response.json()};}
const users={};for(const name of ['compat-owner','compat-second','compat-canonical','compat-inactive','compat-customer'])users[name]=await account(name);
const env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('firestore.rules','utf8')}});
const seed=work=>env.withSecurityRulesDisabled(context=>work(context.firestore()));
await seed(async db=>{
  for(const name of ['compat-owner','compat-second'])await setDoc(doc(db,'admins',users[name].localId),{...legacyDevelopmentAdmin(),displayName:name});
  await setDoc(doc(db,'admins',users['compat-canonical'].localId),{...studioStaff(),displayName:'Canonical inspector'});
  await setDoc(doc(db,'admins',users['compat-inactive'].localId),legacyDevelopmentAdmin(false));
  await setDoc(doc(db,'customerProfiles',users['compat-customer'].localId),{active:true,role:'Admin',staffId:'not-membership'});
  await setDoc(doc(db,'products/compat-product'),{name:'Compatibility inspection draft',price:25000,unitLabel:'per piece',category:['Aso Oke'],images:[{url:'/src/assets/images/hero/hero-ready-to-wear.jpg'}],status:'draft',archived:false,_version:1});
});
const page=(await(await fetch('http://127.0.0.1:9227/json')).json()).find(tab=>tab.type==='page');const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let serial=0;const pending=new Map(),errors=[];
socket.onmessage=({data})=>{const message=JSON.parse(data);if(message.method==='Fetch.requestPaused'){
  // Reload the real app through its emulator-only fixture, not production
  // Firebase endpoints. CDP intercepts only this isolated browser document.
  // Continue a real loopback response (rather than a synthetic fulfilled
  // response without IP metadata), retaining Vite's React Refresh preamble.
  void send('Fetch.continueRequest',{requestId:message.params.requestId,url:'http://127.0.0.1:5182/tests/admin-compatibility-reload.html'}).catch(error=>errors.push(error.message));
}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);const request=pending.get(message.id);if(request){clearTimeout(request.timer);pending.delete(message.id);if(message.error)request.reject(Error(message.error.message));else request.resolve(message.result);}};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error('Compatibility browser command timeout')),30000)});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function until(expression){for(let count=0;count<150;count++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Compatibility condition failed: '+expression+'\n'+await evaluate('document.body.innerText.slice(0,1200)')+'\n'+errors.join('\n'));}
async function navigate(path){await evaluate(`history.pushState({},'',${JSON.stringify(path)});window.dispatchEvent(new PopStateEvent('popstate'));`);const headings={'/admin':['Dashboard'],'/admin/products':['Products'],'/admin/shop':['Shop Control Center'],'/admin/appearance':['Website Appearance'],'/admin/homepage':['Homepage','Homepage Hero'],'/admin/reviews':['Review & Feeds','Reviews'],'/admin/chats':['Chats'],'/admin/audit':['Audit History']};await until(`${JSON.stringify(headings[path.split('?')[0]])}.includes(document.querySelector('#admin-main h1')?.textContent)`);}
async function login(name,allowed=true){await until("!!document.querySelector('#admin-email')");await evaluate(`(()=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const[id,value]of [['admin-email',${JSON.stringify(users[name].email)}],['admin-password',${JSON.stringify(password)}]]){const input=document.getElementById(id);setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('.admin-access form').requestSubmit();})()`);await until(allowed?"!!document.querySelector('.admin-layout')":"document.body.innerText.includes('Staff access unavailable') && !document.querySelector('.admin-layout')");}
async function logout(){await evaluate("import('/src/firebase/auth.js').then(m=>m.signOutUser())");await until("!!document.querySelector('#admin-email') && !document.querySelector('.admin-layout')");}
const steps=[];
try{
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'http://127.0.0.1:5182/admin*',resourceType:'Document'}]});await send('Page.navigate',{url:'http://127.0.0.1:5182/tests/section12-browser.html'});
  for(const name of ['compat-canonical','compat-owner','compat-second']){
    await login(name);await until("document.querySelectorAll('.admin-source-status li').length===3 && [...document.querySelectorAll('.admin-source-status li')].every(item=>item.innerText.includes('Checked'))");
    const mode=await evaluate("import('/src/services/operations.js').then(m=>m.readCurrentStaff()).then(s=>s.compatibilityMode||'canonical')");assert.equal(mode,name==='compat-canonical'?'canonical':'legacy-development-admin');
    await navigate('/admin/products?edit=compat-product');await until("!!document.querySelector('#admin-field-name')");assert.equal(await evaluate("document.querySelector('#admin-field-name').value"),'Compatibility inspection draft');
    for(const path of ['/admin/shop','/admin/appearance','/admin/homepage','/admin/reviews','/admin/chats','/admin/audit']){await navigate(path);await until("!!document.querySelector('#admin-main h1')");assert.equal(await evaluate("document.querySelector('#admin-main h1').textContent==='Access unavailable'"),false,'Blocked Admin destination '+path);}
    await navigate('/admin');await evaluate('window.__compatBeforeReload=true');await send('Page.reload');await until("!window.__compatBeforeReload && !!document.querySelector('.admin-layout')");assert.equal(await evaluate("document.body.innerText.includes('restricted or inactive')"),false);
    await logout();await login(name);steps.push(name+' login/owner destinations/reload/signout/signin');await logout();
  }
  await login('compat-owner');await evaluate(`import('/src/firebase/auth.js').then(m=>m.signIn(${JSON.stringify(users['compat-customer'].email)},${JSON.stringify(password)})).then(()=>true)`);await until("!document.querySelector('.admin-layout') && document.body.innerText.includes('No current admin membership')");steps.push('account switch rechecks actual membership; customer denied');await logout();
  await login('compat-inactive',false);await until("document.body.innerText.includes('Current staff access is inactive')");await logout();
  await login('compat-customer',false);await until("document.body.innerText.includes('No current admin membership')");await logout();
  await login('compat-second');await seed(db=>updateDoc(doc(db,'admins',users['compat-second'].localId),{active:false}));await until("!document.querySelector('.admin-layout') && document.body.innerText.includes('Current staff access is inactive')");steps.push('mid-session legacy revocation removes workspace');
  await seed(db=>updateDoc(doc(db,'admins',users['compat-second'].localId),{active:true}));await until("!!document.querySelector('.admin-layout')");
  await seed(async db=>{for(const name of ['compat-owner','compat-second']){const member=(await getDoc(doc(db,'admins',users[name].localId))).data();assert.equal(Object.hasOwn(member,'staffId'),false);assert.equal(Object.hasOwn(member,'capabilities'),false);}assert.deepEqual((await getDoc(doc(db,'admins',users['compat-canonical'].localId))).data().capabilities,studioStaff().capabilities);});
  assert.deepEqual(errors,[]);await writeFile('.tools.local/admin-compatibility-browser-result.json',JSON.stringify({steps,inactiveDenied:true,noMembershipCustomerDenied:true,canonicalUnchanged:true,noFabricatedMembershipWrites:true,runtimeExceptions:0,environment:'isolated demo/emulators; production not touched'},null,2));console.log('Development Admin compatibility browser checks passed.');
}finally{await send('Fetch.disable');socket.close();await env.cleanup();}
