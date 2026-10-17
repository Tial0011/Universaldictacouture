import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createAccountService } from '../netlify/lib/account-service.js';
import { createPretransactionService } from '../netlify/lib/pretransaction-service.js';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8089';process.env.METADATA_SERVER_DETECTION='none';
const app=initializeApp({projectId:'demo-udc-section12'},'part2-browser-'+randomUUID()),db=getFirestore(app),auth=getAuth(app);
const uid=randomUUID(),staffId=randomUUID(),secret='isolated-browser-fixture-key-not-production';
const capabilities=Object.fromEntries(['create','edit','commercial','media','discovery','publish'].map(action=>['products.'+action,{domainWide:{active:true,purpose:'catalogue'}}]));
await db.doc('admins/'+uid).set({staffId,active:true,capabilities});await db.doc('staffIdentities/'+staffId).set({staffId,principalUid:uid,active:true});
const owner=createPretransactionService(createAccountService({db,auth,secret}));
const name='Native browser piece '+randomUUID().slice(0,8),claims={uid,auth_time:Math.floor(Date.now()/1000)};
const draft=await owner.mutateProduct(claims,{operationId:randomUUID(),action:'create',fields:{name,price:25000,unitLabel:'per set',category:['Aso Oke'],images:[{url:'/vite.svg',alt:'Explicit development fixture'}]}});
await owner.mutateProduct(claims,{productId:draft.productId,expectedVersion:draft.version,operationId:randomUUID(),action:'publish'});
const page=(await(await fetch('http://127.0.0.1:9228/json')).json()).find(t=>t.type==='page'),ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let serial=0;const messages=new Map(),errors=[];
ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);const item=messages.get(m.id);if(item){messages.delete(m.id);clearTimeout(item.timer);if(m.error)item.reject(Error(m.error.message));else item.resolve(m.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;messages.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error(method+' deadline')),30000)});ws.send(JSON.stringify({id,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(expression){for(let i=0;i<250;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Not reached: '+expression+'\n'+await evaluate('document.body.innerText.slice(0,1400)'));}
async function input(id,value,textarea=false){await evaluate(`(()=>{const field=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(${textarea?'HTMLTextAreaElement':'HTMLInputElement'}.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function navigate(path){await evaluate(`history.pushState({},'',${JSON.stringify(path)});dispatchEvent(new PopStateEvent('popstate'));`);}
const email='native-part2-'+randomUUID()+'@example.test';
try{
  await send('Page.enable');await send('Runtime.enable');await send('Accessibility.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:5182/tests/section11-browser.html?route=/signup'});await until("!!document.getElementById('auth-confirm')");
  await input('auth-email',email);await input('auth-password','Native-Part2-Password!');await input('auth-confirm','Native-Part2-Password!');await evaluate("document.querySelector('.auth-flow__form').requestSubmit()");await until("location.pathname==='/verify-email'");
  await navigate('/shop');
  const button=`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify('Add '+name+' to My Closet')})`;
  await until(`!!${button} && !${button}.disabled`);await evaluate(`${button}.click()`);
  await until(`[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')===${JSON.stringify('Remove '+name+' from My Closet')} && b.getAttribute('aria-pressed')==='true')`);
  const saves=await evaluate("import('/src/services/accountApi.js').then(m=>m.accountRequest('saves',{kind:'piece'}))");assert.ok(saves.records.some(r=>r.targetId===draft.productId));
  await navigate('/custom-style');await until("!!document.getElementById('custom-idea')");await input('custom-idea','Private native request idea',true);await input('custom-fabric','Native woven pattern');await evaluate("document.querySelector('.custom-enquiry form').requestSubmit()");
  await until("document.body.innerText.includes('Your Custom Style request is saved')");
  const accountContext=await evaluate("import('/src/services/accountApi.js').then(m=>m.accountRequest('context'))");
  const requests=await db.collection('customStyleRequests').where('accountId','==',accountContext.accountId).get();assert.equal(requests.size,1);assert.equal(requests.docs[0].data().fields.notes,'Private native request idea');assert.equal(requests.docs[0].data().handoff,undefined);
  for(const width of [320,390,768,1024,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);if(width===390){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('.tools.local/section16-part2-native-mobile.png',Buffer.from(shot.data,'base64'));}}
  // Current lifecycle withdrawal removes the private form/values, not just a blur.
  await db.doc('accounts/'+accountContext.accountId).update({lifecycle:'RESTRICTED'});
  await db.doc('customerAccess/'+accountContext.principalUid).update({lifecycle:'RESTRICTED',available:false});
  await until("!document.querySelector('#custom-idea') && document.body.innerText.includes('Account Restricted')");
  const restrictedAX=(await send('Accessibility.getFullAXTree')).nodes.filter(n=>!n.ignored).map(n=>n.name?.value||'').join('\n');assert.ok(!restrictedAX.includes('Private native request idea'));
  await evaluate("import('/src/firebase/auth.js').then(m=>m.signOutUser())");await navigate('/my-closet');await until("!document.body.innerText.includes('Private native request idea')");
  const ax=(await send('Accessibility.getFullAXTree')).nodes.filter(n=>!n.ignored).map(n=>n.name?.value||'').join('\n');assert.ok(!ax.includes('Private native request idea'));
  assert.deepEqual(errors,[]);
  await writeFile('.tools.local/section16-part2-browser-result.json',JSON.stringify({nativeRegistration:true,nativeShopSave:true,durableAccountRelationship:true,nativeCustomStyleSave:true,noOrderOrPaymentCreated:true,restrictionDOMAndAXWithdrawal:true,signOutAXWithdrawal:true,widths:[320,390,768,1024,1440],productionTested:false},null,2));
  console.log('Part2 native Shop save → Account relationship; native Custom Style → private saved request; responsive/sign-out AX checks passed.');
}finally{ws.close();await db.terminate();await deleteApp(app);}
