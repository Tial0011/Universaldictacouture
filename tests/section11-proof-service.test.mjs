import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as flow from '../src/services/authFlow.js';
import * as authority from '../src/services/customerAccountAuthority.js';
import {currentReadDeadline,protectedWriteDeadline} from '../src/services/operationalRuntime.js';
async function proofService({operation='VERIFY_EMAIL',currentEmail=null,requestError=null}={}){
  const context=vm.createContext({crypto:globalThis.crypto});let commits=0;
  const auth={currentUser:currentEmail?{email:currentEmail}:null};
  const sdk={applyActionCode:async()=>{commits++;},confirmPasswordReset:async()=>{commits++;},reload:async()=>{},sendEmailVerification:async()=>{commits++;},sendPasswordResetEmail:async()=>{if(requestError)throw requestError;},verifyPasswordResetCode:async()=> 'proof@example.test',checkActionCode:async()=>({operation,data:{email:'proof@example.test'}})};
  const synthetic=entries=>new vm.SyntheticModule(Object.keys(entries),function(){for(const[key,value]of Object.entries(entries))this.setExport(key,value);},{context});
  const module=new vm.SourceTextModule(await readFile(new URL('../src/firebase/accountActions.js',import.meta.url),'utf8'),{context});
  const accountApi={accountRequest:async action=>{if(action==='recovery-request'){if(requestError && !['auth/user-not-found','auth/user-disabled','auth/too-many-requests','auth/quota-exceeded'].includes(requestError.code))throw requestError;return {state:'accepted'};}throw Object.assign(new Error('Owner unavailable fixture'),{code:'account-source-unavailable'});}};
  await module.link(specifier=>specifier==='firebase/auth'?synthetic(sdk):specifier==='./auth'?synthetic({auth}):specifier.includes('accountApi')?synthetic(accountApi):specifier.includes('authFlow')?synthetic(flow):specifier.includes('customerAccountAuthority')?synthetic(authority):synthetic({currentReadDeadline,protectedWriteDeadline}));await module.evaluate();return {service:module.namespace,commits:()=>commits};
}
test('a verification proof cannot be used as reset/change-email proof or for another signed-in control channel',async()=>{
  for(const operation of ['PASSWORD_RESET','VERIFY_AND_CHANGE_EMAIL','RECOVER_EMAIL']){const subject=await proofService({operation});await assert.rejects(subject.service.inspectEmailVerificationCode('fixture-proof'),{code:'auth/wrong-purpose'});assert.equal(subject.commits(),0);}
  const subject=await proofService({currentEmail:'other@example.test'});await assert.rejects(subject.service.inspectEmailVerificationCode('fixture-proof'),{code:'auth/wrong-account'});assert.equal(subject.commits(),0);
});
test('valid provider proof inspection is read-only; absent durable binding/lifecycle denies verification consumption',async()=>{
  const subject=await proofService();assert.equal((await subject.service.inspectEmailVerificationCode('fixture-proof')).state,'valid');
  for(let n=0;n<2;n++)await assert.rejects(subject.service.applyEmailVerificationCode('fixture-proof'),{code:'account-source-unavailable'});
  assert.equal(subject.commits(),0);assert.equal(subject.service.proofOutcome('fixture-proof'),'not-started');
});
test('credential reset cannot write or pretend confirmed success without current Account/proof authority',async()=>{
  const subject=await proofService();for(let n=0;n<2;n++)await assert.rejects(subject.service.setPasswordFromResetCode('fixture-reset','a-long-fixture-password'),{code:'account-source-unavailable'});
  assert.equal(subject.commits(),0);assert.equal(subject.service.proofOutcome('fixture-reset'),'not-started');
});
test('recovery copy/intake minimizes existence and abuse-state leakage without mistaking unknown for success',async()=>{
  for(const code of ['auth/user-not-found','auth/user-disabled','auth/too-many-requests','auth/quota-exceeded']){const subject=await proofService({requestError:{code}});await subject.service.requestPasswordReset('fixture@example.test');}
  const subject=await proofService({requestError:{code:'auth/network-request-failed'}});await assert.rejects(subject.service.requestPasswordReset('fixture@example.test'),{code:'auth/network-request-failed'});
});
