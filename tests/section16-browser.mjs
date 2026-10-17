import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
const env=await initializeTestEnvironment({projectId:'demo-udc-section12',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('firestore.rules','utf8')}});
const target=(await(await fetch('http://127.0.0.1:9228/json')).json()).find(page=>page.type==='page'),socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let serial=0;const pending=new Map(),exceptions=[];
socket.onmessage=({data})=>{const message=JSON.parse(data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);const p=pending.get(message.id);if(p){pending.delete(message.id);clearTimeout(p.timer);if(message.error)p.reject(Error(message.error.message));else p.resolve(message.result);}};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error(method+' timed out')),30000)});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value;}
async function until(expression){for(let step=0;step<200;step++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Condition: '+expression+'\n'+await evaluate('document.body.innerText.slice(0,1100)'));}
async function input(id,value){await evaluate(`(()=>{const field=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function navigate(path){await evaluate(`history.pushState({},'',${JSON.stringify(path)});dispatchEvent(new PopStateEvent('popstate'));`);}
async function capture(name){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('.tools.local/section16-'+name+'.png',Buffer.from(shot.data,'base64'));}
const email='browser-'+Date.now()+'@example.test',password='Section16-Browser-Only!';
try{
  await send('Page.enable');await send('Runtime.enable');await send('Accessibility.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:5182/tests/section11-browser.html?route=/signup'});await until("!!document.querySelector('#auth-confirm')");
  await input('auth-email',email);await input('auth-password',password);await input('auth-confirm',password);await evaluate("document.querySelector('.auth-flow__form').requestSubmit()");
  await until("location.pathname==='/verify-email' && document.body.innerText.includes('Verify your email')");
  await evaluate("import('/src/firebase/accountActions.js').then(async m=>{const a=await import('/src/firebase/auth.js');await m.sendAccountVerification(a.auth.currentUser);return true;})");
  const proofUrl=await evaluate("import('/src/firebase/auth.js').then(async({auth})=>{const token=await auth.currentUser.getIdToken();const response=await fetch('/_section16_test/proof',{headers:{Authorization:'Bearer '+token}});return (await response.json()).url;})");assert.ok(proofUrl);
  await navigate(new URL(proofUrl).pathname+new URL(proofUrl).search);await until("!![...document.querySelectorAll('button')].find(button=>button.textContent==='Confirm email verification')");
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent==='Confirm email verification').click()");await until("document.body.innerText.includes('Email Verified')");
  await navigate('/profile?area=personal');await until("!!document.querySelector('.profile-details-form input')");
  const current=await evaluate("import('/src/firebase/auth.js').then(async({auth})=>{const p=await import('/src/services/customerProfile.js');return p.fetchCustomerProfile(auth.currentUser.uid);})");
  assert.notEqual(current.accountId,await evaluate("import('/src/firebase/auth.js').then(m=>m.auth.currentUser.uid)"));
  await evaluate(`import('/src/firebase/auth.js').then(async({auth})=>{const p=await import('/src/services/customerProfile.js');return p.saveCustomerProfile(auth.currentUser,{fullName:'Runtime verified private name',phoneNumber:'+234 800 000 0000',publicDisplayName:'Public fixture'},{operationId:crypto.randomUUID(),expectedVersion:${current.version},expectedEpoch:${current.epoch}});})`);
  await navigate('/profile');await until("!![...document.querySelectorAll('button')].find(button=>button.textContent==='Check Profile again')");await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent==='Check Profile again').click()");await navigate('/profile?area=personal');await until("document.querySelector('#profile-fullName')?.value==='Runtime verified private name'");
  for(const width of [320,390,768,1024,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);if(width===390||width===1440)await capture('real-profile-'+width);}
  // API/session ending is exercised by the actual application service, then
  // old Profile data must disappear from the rendered and accessibility trees.
  await evaluate("import('/src/firebase/auth.js').then(m=>m.signOutUser())");await until("!!document.querySelector('#auth-email') && !document.querySelector('.profile-workspace')");
  const ax=(await send('Accessibility.getFullAXTree')).nodes.filter(node=>!node.ignored).map(node=>node.name?.value||'').join('\n');assert.ok(!ax.includes('Runtime verified private name'));
  assert.deepEqual(exceptions,[]);
  await writeFile('.tools.local/section16-browser-result.json',JSON.stringify({registration:true,purposeBoundVerification:true,randomDurableAccount:true,profileWriteAndReadback:true,actualFrontendAdapter:true,signOutAuthorityAndAXWithdrawal:true,widths:[320,390,768,1024,1440],runtimeExceptions:0,productionTested:false,profileNativeSaveControl:'not yet wired; write tested through actual application adapter and backend'},null,2));
  console.log('Section16 browser → API → Firebase → real Profile readback/sign-out checks passed.');
}finally{socket.close();await env.cleanup();}
