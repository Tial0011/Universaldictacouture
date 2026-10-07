import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personalDetailsProjection,personalDetailsPayload,publicProfileIdentity,identityBoundRequests} from '../src/services/profileExperience.js';
import {classifyAccountContext,requireCustomerAccountAuthority} from '../src/services/customerAccountAuthority.js';
import {createAuthContinuation,continuationTarget,clearAuthContinuations,safeReturnPath} from '../src/services/authFlow.js';
import {protectedWriteDeadline,currentReadDeadline} from '../src/services/operationalRuntime.js';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('anonymous/malformed/older/invalidated request tickets fail safely, including same-identity context renewal',()=>{
  const r=identityBoundRequests();assert.equal(r.begin('profile'),null);assert.equal(r.current(null),false);r.reset('A');const ticket=r.begin('profile');assert.ok(Object.isFrozen(ticket));r.invalidate('profile');assert.equal(r.current(ticket),false);const latest=r.begin('profile');r.reset('A');assert.equal(r.current(latest),false);assert.equal(r.current({}),false);
});
test('malformed Profile sources cannot fabricate empty values and inert text never becomes public private-name fallback',()=>{
  for(const raw of [null,undefined,[],42,{fullName:42},{profilePhoto:{url:'public'}}])assert.throws(()=>personalDetailsProjection(raw),{code:'profile-source-unavailable'});
  const text='<script>private()</script>';assert.equal(personalDetailsProjection({fullName:text,staffNotes:'excluded'}).fullName,text);assert.equal(publicProfileIdentity({fullName:text}),null);
  for(const key of ['ownerId','roles','lifecycle','verified','status','audit','internal'])assert.throws(()=>personalDetailsPayload({[key]:true}),{code:'invalid-argument'});
  assert.doesNotMatch(source('src/pages/Profile/Profile.jsx'),/dangerouslySetInnerHTML/);
});
test('wrong-principal live opaque continuation cannot fall back to its old protected return context',()=>{
  const state=createAuthContinuation('/chats','A');assert.equal(continuationTarget(state,'B'),'');assert.equal(continuationTarget(state,'A'),'/chats');clearAuthContinuations();
});
test('auth return carries only route-owned navigation fields, not unknown private snapshots under innocuous keys',()=>{
  assert.equal(safeReturnPath('/profile?area=security&payload=PRIVATE&notes=PRIVATE'),'/profile?area=security');
  assert.equal(safeReturnPath('/profile?area=unknown'),'/profile');assert.equal(safeReturnPath('/chats?context=PRIVATE&send=1'),'/chats');
  assert.equal(safeReturnPath('/reviews-feeds?review=public-reference&context=PRIVATE'),'/reviews-feeds?review=public-reference');
  assert.equal(safeReturnPath('/shop?q=Aso&occasion=Bridal&sort=price-asc&payload=PRIVATE'),'/shop?q=Aso&occasion=Bridal&sort=price-asc');
});
test('lifecycle classification cannot authorize a null principal or infer deleted restoration from credentials',()=>{
  const base={principalUid:'A',accountId:'durable',lifecycle:'ACTIVE',authorized:true,restricted:false};
  for(const principal of [null,undefined,'',' '])assert.equal(classifyAccountContext({...base,principalUid:principal},principal),'unavailable');
  for(const lifecycle of ['DELETED-CUSTOMER REQUESTED','DELETED-ADMIN ACTION'])assert.equal(classifyAccountContext({...base,lifecycle},'A'),'deleted');
  assert.equal(classifyAccountContext({...base,lifecycle:'RESTRICTED'},'A'),'restricted');assert.equal(classifyAccountContext({...base,lifecycle:'RESTORED',authorized:false},'A'),'unavailable');assert.throws(requireCustomerAccountAuthority,{code:'account-source-unavailable'});
});
test('timeout waiting bounds do not cancel owner effect or turn uncertainty into known failure',async()=>{
  let resolve,commits=0;const effect=new Promise(done=>{resolve=done;}).then(()=>{commits++;return 'committed';});await assert.rejects(protectedWriteDeadline(effect,1),{code:'outcome-unknown'});assert.equal(commits,0);resolve();assert.equal(await effect,'committed');assert.equal(commits,1);
  await assert.rejects(currentReadDeadline(new Promise(()=>{}),1),{code:'deadline-exceeded'});
});
test('known recovery validation rejects do not permanently disable corrected intake as unknown outcome',()=>{
  const jsx=source('src/pages/Auth/Auth.jsx');assert.match(jsx,/setOutcomeUnknown\(!\["auth\/invalid-email", "auth\/missing-email", "auth\/invalid-argument"\]/);
});
test('responsive focus, forced color and modal fallback keep semantic safe destinations, not hidden controls',()=>{
  const jsx=source('src/pages/Profile/Profile.jsx');assert.match(jsx,/document.activeElement\?\.id !== "profile-area"/);assert.match(jsx,/moveNavigationFocus/);
  assert.match(source('src/pages/Profile/Profile.css'),/forced-colors:active/);assert.match(source('src/components/auth/AuthGateDialog.jsx'),/\[hidden\], \[inert\], \[aria-hidden='true'\]/);
});
test('coverage indexes 31 unique flows in only Modules 1/2/10, seven current dispositions, six pending flows and zero new visuals',()=>{
  const coverage=JSON.parse(source('docs/section11-part3-coverage.json'));assert.deepEqual(coverage.moduleRegistry.map(m=>m.module),[1,2,10]);const ids=coverage.moduleRegistry.flatMap(m=>m.flowIds);assert.equal(ids.length,31);assert.equal(new Set(ids).size,31);assert.equal(coverage.flows.length,7);assert.equal(coverage.part4FlowIdsNotImplementedInThisRun.length,6);assert.ok(coverage.flows.every(f=>!coverage.part4FlowIdsNotImplementedInThisRun.includes(f.id)));assert.equal(coverage.module10Closed,false);assert.equal(coverage.wholeSectionLock,false);assert.equal(coverage.visualCounts.newCanonical,0);
  const first=JSON.parse(source('docs/section11-part1-coverage.json')),second=JSON.parse(source('docs/section11-part2-coverage.json'));assert.equal(first.visuals.length+second.directVisuals.length,11);assert.equal(second.supportingVisuals.length,4);assert.equal(coverage.visualCounts.retainedTotal,15);
});
