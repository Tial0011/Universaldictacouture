import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {safeReturnPath,passwordPolicyError,authFailureMessage,createAuthContinuation,continuationTarget,clearAuthContinuations,safeNavigationState} from '../src/services/authFlow.js';
import {classifyAccountContext,requireCustomerAccountAuthority} from '../src/services/customerAccountAuthority.js';
const source = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('return rejects protocols/control characters/double encoding/admin routes and strips private/token query fields',()=>{
  for(const path of ['https://foreign.test','//foreign.test','/\t/foreign.test','/shop/%5cforeign','/shop/%255cforeign','/shop/%00','/admin','/shop/%','javascript:alert(1)'])assert.equal(safeReturnPath(path,'/profile'),'/profile');
  assert.equal(safeReturnPath('/shop?focus=search&email=secret&token=secret&returnTo=//foreign'),'/shop?focus=search');
  assert.equal(safeReturnPath('/chats#latest'),'/chats#latest');
});
test('safe continuations contain no payload or command and are account-scoped and cleared on switching',()=>{
  const state=createAuthContinuation('/chats','A');
  assert.deepEqual(Object.keys(state).sort(),['authContinuation','returnTo']);
  assert.equal(continuationTarget(state,'A'),'/chats');
  clearAuthContinuations();
  assert.equal(continuationTarget({authContinuation:state.authContinuation},'B'),'');
});
test('principal transition removes private navigation drafts/proofs rather than repopulating them under another account',()=>{
  const state=safeNavigationState({returnTo:'/chats',returnState:{draft:'PRIVATE'},draft:'PRIVATE',customStyle:{measurements:'PRIVATE'},freshAuthProof:'PRIVATE',profile:{name:'PRIVATE'},role:'Admin',sessionReason:'deleted'});
  assert.deepEqual(state,{returnTo:'/chats'});
  assert.equal(safeNavigationState({draft:'PRIVATE'}),null);
});
test('current written password bounds preserve paste/unicode/password managers without old numeric visual policy',()=>{
  assert.ok(passwordPolicyError('x'.repeat(14)));assert.equal(passwordPolicyError('x'.repeat(15)),'');assert.equal(passwordPolicyError('x'.repeat(64)),'');assert.ok(passwordPolicyError('x'.repeat(65)));
  assert.equal(passwordPolicyError('🙂'.repeat(15)),'');
  const jsx=source('src/pages/Auth/Auth.jsx');assert.doesNotMatch(jsx,/minLength=\{6\}|auth-phone|auth-full-name|onPaste|Keep me signed in/);
});
test('authentication failure copy does not expose existence/provider internals',()=>{
  const kinds=['auth/user-not-found','auth/wrong-password','auth/invalid-credential','auth/email-already-in-use'];
  assert.equal(new Set(kinds.map(code=>authFailureMessage({code,message:'SECRET'}))).size,1);
  assert.doesNotMatch(authFailureMessage({message:'SECRET TOKEN infrastructure'}),/SECRET|TOKEN|infrastructure/);
});
test('current lifecycle model requires exact resolved principal and durable Account; provider identity alone never authorizes',()=>{
  assert.equal(classifyAccountContext({principalUid:'A'},'A'),'unavailable');
  const active={principalUid:'A',accountId:'durable',lifecycle:'ACTIVE',authorized:true,restricted:false};
  assert.equal(classifyAccountContext(active,'B'),'unavailable');assert.equal(classifyAccountContext(active,'A'),'authorized');
  for(const lifecycle of ['DELETED-CUSTOMER REQUESTED','DELETED-ADMIN ACTION'])assert.equal(classifyAccountContext({...active,lifecycle},'A'),'deleted');
  assert.equal(classifyAccountContext({...active,lifecycle:'RESTRICTED'},'A'),'restricted');
  assert.equal(classifyAccountContext({...active,lifecycle:'RESTORED',restricted:true},'A'),'restricted');
  assert.equal(classifyAccountContext({...active,lifecycle:'DEACTIVATED'},'A'),'unavailable');
  assert.throws(requireCustomerAccountAuthority,{code:'account-source-unavailable'});
});
test('proof link open is read-only and token-bearing URL is withdrawn before child passive effects',()=>{
  const jsx=source('src/pages/Auth/Auth.jsx');assert.match(jsx,/promise: inspectEmailVerificationCode\(actionCode\)/);
  assert.match(jsx,/useLayoutEffect/);assert.match(jsx,/history.replaceState\(window.history.state, "", path\)/);
  assert.match(jsx,/Confirm email verification/);assert.doesNotMatch(jsx,/promise: applyEmailVerificationCode/);
});
test('principal transition unmounts sensitive forms/caches/announcements and BFCache/offline rechecks have stale response guards',()=>{
  const context=source('src/context/AuthContext.jsx');assert.match(context,/Fragment key=\{user\?\.uid \|\| sessionState\}/);assert.match(context,/version !== generation/);assert.match(context,/event.persisted/);assert.match(context,/setSessionState\("unverifiable"\)/);
  assert.match(source('src/firebase/auth.js'),/generation !== transitionGeneration/);
  assert.match(source('src/hooks/useCustomerSession.js'),/user: null/);
});
test('trusted legacy customer grants are closed, not merely hidden, while staff routes keep independently complete grants',()=>{
  const rules=source('firestore.rules');assert.match(rules,/match \/customerProfiles\/\{uid\}[\s\S]*?allow read: if false/);
  assert.match(rules,/function owner\(\) \{\s*return false;/);
  assert.match(rules,/match \/savedPieces\/\{uid\} \{\s*allow read, write: if false;/);
  assert.match(rules,/canStaff\('chats.reply', 'customer-service'/);
});
test('native Auth Gate provides background inertness/focus/cancel parity rather than blur-only private protection',()=>{
  const gate=source('src/components/auth/AuthGateDialog.jsx');assert.match(gate,/dialogRef.current.showModal\(\)/);assert.match(gate,/<dialog ref=/);assert.match(gate,/previousFocus.focus/);assert.match(gate,/onCancel=/);
  assert.match(source('src/components/auth/AuthGate.css'),/max-width:599px/);
});
test('Part-1 coverage accounts for exactly ten official flows and three composites without faking complete owner work',()=>{
  const coverage=JSON.parse(source('docs/section11-part1-coverage.json'));
  assert.equal(coverage.verdict,'PARTIAL');assert.equal(coverage.wholeSectionLock,false);assert.equal(coverage.flowCount,10);
  assert.deepEqual(coverage.flows.map(flow=>flow.id),Array.from({length:10},(_,index)=>`S11-M01-F${String(index+1).padStart(2,'0')}`));
  assert.equal(coverage.visuals.length,3);assert.ok(coverage.flows.every(flow=>flow.reason&&flow.evidence.length&&flow.owner&&!flow.completion));
  assert.equal(coverage.dependencies.length,4);
});
