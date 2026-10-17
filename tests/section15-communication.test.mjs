import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {createAccountService} from '../netlify/lib/account-service.js';
import {createConfigurationService} from '../netlify/lib/shared-configuration.js';
import {createCommunicationService} from '../netlify/lib/communication-service.js';
import {nativeCommunicationPolicies} from '../netlify/lib/communication-sources.js';
import {createCommunicationTestSend} from '../netlify/lib/communication-test-send.js';
import {createAccountHandler} from '../netlify/lib/account-handler.js';
import {createSystemMaintenance} from '../netlify/lib/system-maintenance.js';
import {communicationEmail} from '../netlify/lib/communication-email.js';
import {defaultCommunicationCopy,validateCommunicationCopy,renderCommunication,syntheticContext,historyStart,badge,TAXONOMIES} from '../netlify/lib/communication-contract.js';

const id=()=>randomUUID(),workerPolicy={leaseMs:1000,maxAttempts:2}; // fixture only
let app,db,auth,account,config,a,b,staff,time,sourcePolicies;
before(async()=>{
  process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8089';process.env.METADATA_SERVER_DETECTION='none';
  app=initializeApp({projectId:'demo-udc-s15-'+id().slice(0,8)},'s15-'+id());db=getFirestore(app);auth=getAuth(app);time=Date.now();account=createAccountService({db,auth,secret:'section15-fixture-not-a-production-secret',now:()=>time});config=createConfigurationService(account);
  async function customer(){const email=`s15-${id()}@example.test`;await account.register({email,password:'Section15-Fixture-Password!',operationId:id()});const principal=await auth.getUserByEmail(email),claims={uid:principal.uid,auth_time:Math.floor(time/1000)};const owner=await account.context(claims);const sessionId=id();await db.doc(`accountSessions/${sessionId}`).set({uid:claims.uid,kind:'customer',accountId:owner.accountId,epoch:owner.epoch,active:true,expiresAt:time+86400000});return{...claims,accountId:owner.accountId,_session:{id:sessionId,kind:'customer'}};}
  a=await customer();b=await customer();const uid=id(),staffId=id(),sessionId=id();staff={uid,staffId,auth_time:Math.floor(time/1000),kind:'staff',_session:{id:sessionId,kind:'staff'}};
  await db.doc(`staffIdentities/${staffId}`).set({staffId,principalUid:uid,active:true});await db.doc(`accountSessions/${sessionId}`).set({uid,kind:'staff',staffId,active:true,expiresAt:time+86400000});
  await auth.createUser({uid,email:`s15-staff-${uid}@example.test`,password:'Section15-Fixture-Password!',emailVerified:true});
  await db.doc(`admins/${uid}`).set({active:true,staffId,capabilities:Object.fromEntries([
    ['notifications.read',{selectedObject:{active:true,purpose:'personal-notifications',ids:[staffId]}}],['notifications.edit',{selectedObject:{active:true,purpose:'personal-notifications',ids:[staffId]}}],
    ['settings.templates.read',{domainWide:{active:true,purpose:'communication-settings'}}],['settings.templates.edit',{domainWide:{active:true,purpose:'communication-settings'}}],
  ])});
  sourcePolicies={fixture:{qualify:async(tx,event)=>event.action==='ordinary-chat'?[]:[makeIntent(event)],current:async(tx,event)=>{const source=(await tx.get(db.doc(`fixtureSource/${event.target}`))).data();return{applicable:source?.applicable===true,consent:source?.consent===true,route:source?.route};},presentation:async(tx,event)=>{const source=(await tx.get(db.doc(`fixtureSource/${event.target}`))).data();return{visibility:source?.visibility||'HIDDEN',actionability:source?.actionability||'ACTIONABILITY_UNCONFIRMED',route:source?.route||null};}}};
});
after(async()=>{await db?.terminate();await deleteApp(app);});
function makeIntent(event,override={}){return{purpose:'approval',domain:'customer',taxonomy:'ACTION REQUIRED',templateId:'template:s15:customer:action',source:{target:event.target},sourceVersion:1,privacyClass:'SAFE',mandatory:true,optionalPreference:null,consentRequired:false,channels:[{channel:'in-app',policy:'REQUIRED'},{channel:'email',policy:'REQUIRED'}],recipientIds:[a.accountId],context:{order_reference:'UDC-SAMPLE-1047'},policyVersion:'fixture-v1',...override};}
async function event(action='approved'){const eventId=account.keyed(id()),target=id();await db.doc(`fixtureSource/${target}`).set({applicable:true,consent:true,visibility:'FULL',actionability:'ACTIONABLE_CONFIRMED',route:'/my-closet/orders/sample'});await db.doc(`ownerEvents/${eventId}`).set({eventId,domain:'fixture',action,target,operationId:id(),actor:{kind:'customer',accountId:a.accountId},executor:'system:fixture',schemaVersion:1,committedAt:time,effects:['audit']});return{eventId,target};}
async function publish(templateId='template:s15:customer:action',value=defaultCommunicationCopy(templateId)){const current=await config.read(staff,templateId),draft=await config.mutate(staff,{configurationId:templateId,action:'draft',operationId:id(),expectedVersion:current.version,value});return config.mutate(staff,{configurationId:templateId,action:'activate',operationId:id(),expectedVersion:draft.version,proposedVersion:draft.proposedVersion});}
async function communication(extra={}){return createCommunicationService(account,config,{sourcePolicies,workerPolicy,origin:'http://127.0.0.1:5182',...extra});}
async function available(service,source){source ||= await event();await publish();const plan=await service.qualify(source.eventId,'fixture'),routes=await service.route(plan.intentIds[0]),branchId=routes.branches.find(branch=>branch.outcome==='ROUTED').branchId,bound=await service.bind(branchId);await service.worker.run(bound.jobId,workerPolicy);return{source,branchId,jobId:bound.jobId};}

test('F01 five taxonomies, raw writes cannot qualify, ordinary Chat creates zero, duplicate semantic intake converges',async()=>{
  assert.equal(TAXONOMIES.length,5);const service=await communication();await assert.rejects(service.qualify(id(),'fixture'),{code:'communication-source-unavailable'});
  const chat=await event('ordinary-chat');assert.equal((await service.qualify(chat.eventId,'fixture')).state,'NO_COMMUNICATION');
  const source=await event(),plans=await Promise.all([service.qualify(source.eventId,'fixture'),service.qualify(source.eventId,'fixture')]);assert.deepEqual(plans[0],plans[1]);assert.equal((await db.collection('communicationIntents').where('eventId','==',source.eventId).get()).size,1);
});
test('F02 separate Customer/Staff intents, no zero-recipient fallback, Optional News never Staff/In-App',async()=>{
  const source=await event(),multi={...sourcePolicies.fixture,qualify:async(tx,event)=>[makeIntent(event),makeIntent(event,{domain:'staff',taxonomy:'INFORMATION',templateId:'template:s15:staff:information',purpose:'assignment',recipientIds:[staff.staffId],context:{approved_source_reference:'UDC-SAMPLE-1047'}})]};
  const service=await communication({sourcePolicies:{multi}}),plan=await service.qualify(source.eventId,'multi');assert.equal(plan.intentIds.length,2);for(const intentId of plan.intentIds)await service.route(intentId);
  const rows=await db.collection('notificationBindings').where('intentId','in',plan.intentIds).get();assert.equal(new Set(rows.docs.map(row=>row.data().recipientKey)).size,2);
  const zero=await communication({sourcePolicies:{zero:{...multi,qualify:async(tx,event)=>[makeIntent(event,{recipientIds:[]})]}}}),zeroPlan=await zero.qualify((await event()).eventId,'zero');assert.deepEqual(await zero.route(zeroPlan.intentIds[0]),{state:'RECIPIENT_UNRESOLVED',branches:[]});
  const news=await communication({sourcePolicies:{news:{...multi,qualify:async(tx,event)=>[makeIntent(event,{taxonomy:'OPTIONAL NEWS',templateId:'template:s15:customer:news',mandatory:false,context:{},channels:[{channel:'in-app',policy:'REQUIRED'}]})]}}});await assert.rejects(news.qualify((await event()).eventId,'news'),{code:'optional-news-policy-denied'});
});
test('F02 essential floor, preference and consent suppression, unsupported V1 channel explicit',async()=>{
  const optional={...sourcePolicies.fixture,qualify:async(tx,event)=>[makeIntent(event,{mandatory:false,optionalPreference:'styleCircle',consentRequired:true})]};
  const service=await communication({sourcePolicies:{optional}}),source=await event(),plan=await service.qualify(source.eventId,'optional');let routes=await service.route(plan.intentIds[0]);assert.ok(routes.branches.every(branch=>branch.outcome==='SUPPRESSED_BY_PREFERENCE'));
  await db.doc(`accountPreferences/${a.accountId}`).update({styleCircle:true});const next=await event();await db.doc(`fixtureSource/${next.target}`).update({consent:false});const p2=await service.qualify(next.eventId,'optional');routes=await service.route(p2.intentIds[0]);assert.ok(routes.branches.every(branch=>branch.outcome==='SUPPRESSED_BY_CONSENT'));
  const sms=await communication({sourcePolicies:{sms:{...sourcePolicies.fixture,qualify:async(tx,event)=>[makeIntent(event,{channels:[{channel:'sms',policy:'REQUIRED'}]})]}}}),p3=await sms.qualify((await event()).eventId,'sms');assert.equal((await sms.route(p3.intentIds[0])).branches[0].outcome,'UNSUPPORTED_CHANNEL');
});
test('F03 Routed is not Available, count ignores Email, cross-account denied, read/archive never source mutation',async()=>{
  const service=await communication(),source=await event();await publish();const plan=await service.qualify(source.eventId,'fixture'),routes=await service.route(plan.intentIds[0]),branchId=routes.branches[0].branchId;
  assert.ok(!(await service.list(a,'customer')).records.some(row=>row.notificationId===branchId));const bound=await service.bind(branchId);assert.equal((await service.worker.run(bound.jobId,workerPolicy)).state,'applied');const list=await service.list(a,'customer');const item=list.records.find(row=>row.notificationId===branchId);assert.equal(item.read,false);assert.equal((await service.list(b,'customer')).records.length,0);
  await assert.rejects(service.open(b,'customer',branchId),{code:'permission-denied'});const original=(await db.doc(`fixtureSource/${source.target}`).get()).data();await service.change(a,'customer',{notificationId:branchId,action:'read',expectedVersion:0,operationId:id()});assert.deepEqual((await db.doc(`fixtureSource/${source.target}`).get()).data(),original);
});
test('F03 archive Undo server-enforced ten seconds and same managed session, duplicate/unknown readback',async()=>{
  const service=await communication(),{branchId}=await available(service);const operationId=id(),input={notificationId:branchId,action:'archive',expectedVersion:0,operationId};const result=await service.change(a,'customer',input);assert.deepEqual(await service.change(a,'customer',input),result);assert.equal((await service.reconcile(a,'customer',operationId)).state,'committed');assert.equal((await service.reconcile(b,'customer',operationId)).state,'unknown');
  const other=id();await db.doc(`accountSessions/${other}`).set({uid:a.uid,kind:'customer',accountId:a.accountId,epoch:1,active:true,expiresAt:time+86400000});await assert.rejects(service.change({...a,_session:{id:other,kind:'customer'}},'customer',{notificationId:branchId,action:'undo',expectedVersion:result.version,operationId:id(),undoToken:result.undoToken}),{code:'undo-expired'});
  time+=10000;await assert.rejects(service.change(a,'customer',{notificationId:branchId,action:'undo',expectedVersion:result.version,operationId:id(),undoToken:result.undoToken}),{code:'undo-expired'});time-=10000;
  const restored=await service.change(a,'customer',{notificationId:branchId,action:'undo',expectedVersion:result.version,operationId:id(),undoToken:result.undoToken});assert.equal(restored.version,2);
});
test('F03 current action filter excludes unknown/resolved and hidden rows contribute zero information',async()=>{
  const service=await communication(),{branchId,source}=await available(service);assert.ok((await service.list(a,'customer',{filter:'action-required'})).records.some(row=>row.notificationId===branchId));
  await db.doc(`fixtureSource/${source.target}`).update({actionability:'ACTIONABILITY_UNCONFIRMED'});assert.ok(!(await service.list(a,'customer',{filter:'action-required'})).records.some(row=>row.notificationId===branchId));
  const before=(await service.list(a,'customer')).count;await db.doc(`fixtureSource/${source.target}`).update({visibility:'HIDDEN'});const hidden=await service.list(a,'customer');assert.equal(hidden.count,before-1);assert.ok(!JSON.stringify(hidden).includes(branchId));
});
test('F04 exact Staff filters, current revocation/deactivation, independent recipient-domain state',async()=>{
  const service=await communication();await assert.rejects(service.list(staff,'staff',{filter:'action-required'}),{code:'invalid-filter'});await assert.rejects(service.list(staff,'staff',{filter:'delivery-issues'}),{code:'invalid-filter'});
  const path=db.doc(`admins/${staff.uid}`),raw=(await path.get()).data();await path.update({active:false});await assert.rejects(service.list(staff,'staff'),{code:'permission-denied'});await path.set(raw);
  const identity=db.doc(`staffIdentities/${staff.staffId}`);await identity.update({active:false});await assert.rejects(service.list(staff,'staff'),{code:'staff-inactive'});await identity.update({active:true});
  await path.update({capabilities:{}});await assert.rejects(service.list(staff,'staff'),{code:'permission-denied'});await path.set(raw);
});
test('F05 controlled copy, Security core, no raw URLs/code/private/external variables; preview synthetic only',async()=>{
  const templateId='template:s15:customer:action',copy=defaultCommunicationCopy(templateId);assert.throws(()=>validateCommunicationCopy(templateId,{...copy,body:'{{payment_proof}}'}),{code:'template-variable-denied'});assert.throws(()=>validateCommunicationCopy(templateId,{...copy,body:'<script>bad</script>'}),{code:'unsafe-template-copy'});assert.throws(()=>validateCommunicationCopy(templateId,{...copy,body:'https://evil.test'}),{code:'unsafe-template-copy'});assert.throws(()=>validateCommunicationCopy(templateId,{...copy,subject:'{{order_reference}}'}),{code:'template-variable-denied'});
  const security='template:s15:staff:security';assert.throws(()=>validateCommunicationCopy(security,{...defaultCommunicationCopy(security),body:'Ignore this security change.'}),{code:'template-security-core-locked'});
  const preview=await config.preview(staff,{configurationId:templateId,value:copy,preset:'long'});assert.equal(preview.synthetic,true);assert.ok(preview.body.includes('SAMPLE'));assert.equal(preview.state,'preview');assert.throws(()=>renderCommunication(templateId,copy,{}),{code:'template-context-required'});assert.ok(!JSON.stringify(syntheticContext(templateId)).includes(a.accountId));
});
test('F05 concurrent Publish has one current winner; bound render stays historical after later Template change',async()=>{
  const templateId='template:s15:customer:action',service=await communication(),{branchId}=await available(service),original=(await db.doc(`notificationBindings/${branchId}`).get()).data();const current=await config.read(staff,templateId),draft=await config.mutate(staff,{configurationId:templateId,action:'draft',operationId:id(),expectedVersion:current.version,value:{...defaultCommunicationCopy(templateId),heading:'A new future heading'}});
  const results=await Promise.allSettled([1,2].map(()=>config.mutate(staff,{configurationId:templateId,action:'activate',operationId:id(),expectedVersion:draft.version,proposedVersion:draft.proposedVersion})));assert.equal(results.filter(result=>result.status==='fulfilled').length,1);await service.bind(branchId);assert.deepEqual((await db.doc(`notificationBindings/${branchId}`).get()).data().render,original.render);
  const history=await config.history(staff,templateId);assert.equal(history.records.filter(row=>row.state==='PUBLISHED CURRENT').length,1);assert.ok(history.records.some(row=>row.state==='SUPERSEDED'));
});
test('F06 send acknowledgement loss reconciles before retry; optional source resolves before dispatch',async()=>{
  const applied=new Set();let sends=0;await auth.updateUser(a.uid,{emailVerified:true});const provider={reconcile:async key=>applied.has(key)?'applied':'not-applied',send:async payload=>{sends++;applied.add(payload.idempotencyKey);throw Error('ack lost');}};const service=await communication({provider}),source=await event();await publish();const plan=await service.qualify(source.eventId,'fixture'),routes=await service.route(plan.intentIds[0]),email=routes.branches[1].branchId,bound=await service.bind(email);
  assert.equal((await service.worker.run(bound.jobId,workerPolicy)).state,'unknown');assert.equal((await service.worker.run(bound.jobId,workerPolicy)).state,'applied');assert.equal(sends,1);assert.equal((await db.doc(`notificationBindings/${email}`).get()).data().state,'PROVIDER ACCEPTED');
  const newer=await event(),p2=await service.qualify(newer.eventId,'fixture'),r2=await service.route(p2.intentIds[0]),b2=await service.bind(r2.branches[1].branchId);await db.doc(`fixtureSource/${newer.target}`).update({applicable:false});assert.equal((await service.worker.run(b2.jobId,workerPolicy)).state,'suppressed');assert.equal(sends,1);
});
test('F06 out-of-order evidence is not a success ladder and callback duplicates converge; protected issues hidden',async()=>{
  const service=await communication(),source=await event();await publish();const plan=await service.qualify(source.eventId,'fixture'),routes=await service.route(plan.intentIds[0]),branchId=routes.branches[1].branchId;await service.bind(branchId);
  const bounce={evidenceId:'bounce',attemptId:id(),providerTime:time+2000,kind:'TERMINAL FAILURE'};
  await assert.rejects(service.recordEvidence(branchId,bounce),{code:'provider-attempt-association-denied'});
  await db.doc(`downstreamAttempts/${bounce.attemptId}`).set({jobId:account.keyed(`communication-job:${branchId}`),startedAt:time});
  await service.recordEvidence(branchId,bounce);await service.recordEvidence(branchId,{evidenceId:'delivered',attemptId:bounce.attemptId,providerTime:time+1000,kind:'PROVIDER-REPORTED DELIVERED'});await service.recordEvidence(branchId,bounce);assert.equal((await db.doc(`notificationBindings/${branchId}`).get()).data().state,'TERMINAL FAILURE');assert.equal((await service.issues(staff)).records.length,0);assert.ok(!JSON.stringify(await service.issues(staff)).includes(branchId));
  await service.recordEvidence(branchId,{evidenceId:'late-observation',attemptId:bounce.attemptId,providerTime:time+3000,timeBasis:'OBSERVATION',kind:'PROVIDER ACCEPTED'});assert.equal((await db.doc(`notificationBindings/${branchId}`).get()).data().state,'TERMINAL FAILURE');
  await assert.rejects(service.issueDetail(staff,branchId),{code:'permission-denied'});
  const membership=db.doc(`admins/${staff.uid}`),original=(await membership.get()).data();await membership.update({capabilities:{...original.capabilities,'communications.delivery.read':{dataPurpose:{active:true,purpose:'communication-reliability',ids:[branchId],dataClasses:['delivery-evidence']}}}});
  const detail=await service.issueDetail(staff,branchId);assert.equal(detail.deliveryState,'TERMINAL FAILURE');assert.equal(detail.evidence.length,3);assert.ok(!JSON.stringify(detail).includes(a.accountId));assert.ok(!Object.hasOwn(detail,'render'));assert.equal((await service.issues(staff)).records.length,1);await membership.set(original);
});
test('history boundaries are UX-only; calendar twelve months, 180 days and unavailable count semantics',()=>{
  const timestamp=Date.UTC(2025,2,31,12);assert.equal(historyStart('customer',timestamp),Date.UTC(2024,2,31,12));assert.equal(historyStart('staff',timestamp),timestamp-180*86400000);assert.equal(badge(null),null);assert.equal(badge(0),'0');assert.equal(badge(99),'99');assert.equal(badge(100),'99+');
});
test('F05 Email has controlled single-column markup, escaped text, safe destination and plain-text fallback',()=>{
  const render={...defaultCommunicationCopy('template:s15:customer:action'),heading:'A & B <inert>'},email=communicationEmail(render,{origin:'https://example.test',route:'/my-closet/orders/sample'});
  assert.ok(email.html.includes('A &amp; B &lt;inert&gt;'));assert.ok(email.html.includes('max-width:600px'));assert.ok(email.plainText.includes('A & B <inert>'));assert.equal((email.html.match(/<a /g)||[]).length,1);assert.ok(!email.html.includes('<img'));
  assert.throws(()=>communicationEmail(render,{origin:'http://external.test',route:'/profile'}),{code:'communication-origin-unavailable'});assert.throws(()=>communicationEmail(render,{origin:'https://example.test',route:'//evil.test'}),{code:'communication-destination-denied'});
});
test('F03 Mark all read affects only authorized presentation and never source truth',async()=>{
  const service=await communication(),{source}=await available(service),original=(await db.doc(`fixtureSource/${source.target}`).get()).data(),operationId=id();
  const result=await service.markAll(a,'customer',{operationId});assert.ok(result.changed>0);assert.equal((await service.list(a,'customer')).count,0);assert.deepEqual(await service.markAll(a,'customer',{operationId}),result);assert.deepEqual((await db.doc(`fixtureSource/${source.target}`).get()).data(),original);
});
test('F05 internal Test Send is synthetic, verified Staff-only, idempotent and reconciles lost acknowledgement',async()=>{
  const applied=new Set();let sends=0;const provider={reconcile:async key=>applied.has(key)?'applied':'not-applied',send:async payload=>{sends++;assert.equal(payload.test,true);assert.ok(payload.destination.includes('s15-staff-'));assert.ok(payload.render.subject.startsWith('[TEST]'));assert.ok(!JSON.stringify(payload).includes(a.accountId));applied.add(payload.idempotencyKey);throw Error('lost acknowledgement');}};
  const service=createCommunicationTestSend(account,config,{provider,origin:'http://127.0.0.1:5182'}),input={configurationId:'template:s15:customer:action',operationId:id(),value:defaultCommunicationCopy('template:s15:customer:action'),preset:'standard'},before=(await db.collection('notificationBindings').get()).size;
  assert.equal((await service.send(staff,input)).state,'OUTCOME UNCERTAIN');assert.equal((await service.read(staff,input.operationId)).state,'PROVIDER ACCEPTED');assert.equal((await service.send(staff,input)).state,'PROVIDER ACCEPTED');assert.equal(sends,1);assert.equal((await db.collection('notificationBindings').get()).size,before);await assert.rejects(service.send(staff,{...input,destination:'customer@example.test'}),{code:'invalid-argument'});
  const missing=createCommunicationTestSend(account,config);assert.equal((await missing.send(staff,{...input,operationId:id()})).state,'ROUTE UNAVAILABLE');
});
test('native owner-policy excludes stale approval event, ordinary writes and former assignee routes',async()=>{
  const orderId=id(),operationId=id(),eventId=account.keyed(id());await db.doc(`orders/${orderId}`).set({_ownerVersion:3,orderId,accountId:a.accountId,version:2,currentWork:'base',assignedStaffId:null,status:'OPEN'});await db.doc(`orders/${orderId}/work/base`).set({componentId:'base',currentEdition:1,businessApproval:{edition:1},customerApproval:null,cancelled:false});await db.doc(`transactionOperations/${operationId}`).set({state:'committed',action:'commercial.business-approve',target:orderId+':base',result:{orderId,componentId:'base',version:2,edition:1}});const event={eventId,domain:'transaction',executor:'system:transaction-api',schemaVersion:1,operationId,action:'commercial.business-approve',target:orderId+':base',effects:['audit'],committedAt:time};await db.doc(`ownerEvents/${eventId}`).set(event);
  const service=createCommunicationService(account,config,{sourcePolicies:nativeCommunicationPolicies(account)}),plan=await service.qualify(eventId,'native-transaction');assert.equal(plan.intentIds.length,1);await db.doc(`orders/${orderId}/work/base`).update({currentEdition:2});const routes=await service.route(plan.intentIds[0]);assert.ok(routes.branches.every(branch=>branch.outcome==='STALE_ROUTE_SUPPRESSED'));
});
test('S15 real Firebase-token/managed-session HTTP path serves minimized Customer history and controlled Templates',async()=>{
  time=Date.now(); // Firebase issues fresh auth_time from its real emulator clock.
  const origin='http://127.0.0.1:5182',handler=createAccountHandler({db,auth,secret:account.secret,now:()=>time,origin}),password='Section15-Fixture-Password!';
  async function login(claims){const user=await auth.getUser(claims.uid);const value=await(await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-test-key',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({email:user.email,password,returnSecureToken:true,targetProjectId:app.options.projectId})})).json();assert.ok(value.idToken,value.error?.message);const kind=claims.kind==='staff'?'staff':'customer';const response=await handler(new Request(`${origin}/.netlify/functions/account?action=session-start`,{method:'POST',headers:{Authorization:`Bearer ${value.idToken}`,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({kind,keepSignedIn:false,label:'Section15 isolated fixture'})}));assert.equal(response.status,200);return{token:value.idToken,cookie:response.headers.get('set-cookie').split(';')[0]};}
  const staffSession=await login(staff),customerSession=await login(a);
  async function request(session,action,input={},method='GET'){const url=new URL('/.netlify/functions/account',origin);url.searchParams.set('action',action);if(method==='GET')for(const [key,value]of Object.entries(input))url.searchParams.set(key,value);return handler(new Request(url,{method,headers:{Authorization:`Bearer ${session.token}`,Cookie:session.cookie,Origin:origin,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(input)}:{})}));}
  const library=await request(staffSession,'staff-template-library');assert.equal(library.status,200);assert.equal((await library.json()).records.length,9);
  assert.equal((await request(customerSession,'staff-template-library')).status,401);
  const list=await request(customerSession,'notifications');assert.equal(list.status,200);assert.ok(Array.isArray((await list.json()).records));
  assert.equal((await request(customerSession,'notifications',{},'POST')).status,405);
  const malformed=await request(customerSession,'notification-change',{notificationId:'unknown',action:'read',expectedVersion:0,operationId:id(),recipientId:b.accountId},'POST');assert.equal(malformed.status,400);
  const preview=await request(staffSession,'staff-template-preview',{configurationId:'template:s15:customer:action',value:defaultCommunicationCopy('template:s15:customer:action'),preset:'standard'},'POST');assert.equal(preview.status,200);assert.equal((await preview.json()).synthetic,true);
});
test('F06 Reminder is new lineage, concurrent occurrence dedupes and resolved source prevents a new Reminder',async()=>{
  const fixture={...sourcePolicies.fixture,reminder:async(tx,event)=>{const current=(await tx.get(db.doc(`fixtureSource/${event.target}`))).data();return current?.applicable?[makeIntent(event)]:[];}};
  const service=await communication({sourcePolicies:{fixture}}),source=await event(),original=await service.qualify(source.eventId,'fixture'),reminders=await Promise.all([service.qualify(source.eventId,'fixture','reviewed-fixture-occurrence'),service.qualify(source.eventId,'fixture','reviewed-fixture-occurrence')]);
  assert.equal(reminders[0].planId,reminders[1].planId);assert.notEqual(reminders[0].planId,original.planId);assert.notEqual(reminders[0].intentIds[0],original.intentIds[0]);
  await db.doc(`fixtureSource/${source.target}`).update({applicable:false});assert.equal((await service.qualify(source.eventId,'fixture','next-reviewed-occurrence')).state,'NO_COMMUNICATION');
  const closed=await communication();await assert.rejects(closed.qualify((await event()).eventId,'fixture','unapproved-reminder'),{code:'reminder-not-permitted'});
});
test('M01/F04 malformed substring scope cannot authorize a protected notification destination',async()=>{
  const path=db.doc(`admins/${staff.uid}`),raw=(await path.get()).data(),service=await communication();
  await path.update({capabilities:{...raw.capabilities,'notifications.read':{selectedObject:{active:true,purpose:'personal-notifications',ids:`prefix-${staff.staffId}-suffix`}}}});
  await assert.rejects(service.list(staff,'staff'),{code:'permission-denied'});await path.set(raw);
});
test('F03/F04 same human retains separate Customer and Staff counts and read/archive domains',async()=>{
  const dualId=id(),sessionId=id();await db.doc(`admins/${a.uid}`).set({active:true,staffId:dualId,capabilities:{'notifications.read':{selectedObject:{active:true,purpose:'personal-notifications',ids:[dualId]}},'notifications.edit':{selectedObject:{active:true,purpose:'personal-notifications',ids:[dualId]}}}});await db.doc(`staffIdentities/${dualId}`).set({staffId:dualId,principalUid:a.uid,active:true});await db.doc(`accountSessions/${sessionId}`).set({uid:a.uid,kind:'staff',staffId:dualId,active:true,expiresAt:time+86400000});const dual={uid:a.uid,auth_time:Math.floor(time/1000),kind:'staff',_session:{id:sessionId,kind:'staff'}};
  const policies={dual:{...sourcePolicies.fixture,qualify:async(tx,event)=>[makeIntent(event),makeIntent(event,{domain:'staff',purpose:'staff-awareness',taxonomy:'INFORMATION',templateId:'template:s15:staff:information',recipientIds:[dualId],context:{approved_source_reference:'UDC-SAMPLE'}})]}},service=await communication({sourcePolicies:policies});await publish('template:s15:staff:information');await publish();const plan=await service.qualify((await event()).eventId,'dual');for(const intentId of plan.intentIds){const routes=await service.route(intentId),branch=routes.branches.find(row=>row.outcome==='ROUTED');const bound=await service.bind(branch.branchId);await service.worker.run(bound.jobId,workerPolicy);}
  const customer=(await service.list(a,'customer')).count,personal=await service.list(dual,'staff');assert.equal(personal.count,1);assert.equal(personal.records.length,1);await service.change(dual,'staff',{notificationId:personal.records[0].notificationId,action:'read',operationId:id(),expectedVersion:0});assert.equal((await service.list(dual,'staff')).count,0);assert.equal((await service.list(a,'customer')).count,customer);await assert.rejects(service.list(a,'staff'),{code:'session-required'});
});
test('F06 missing content remains distinct from delivery failure and activation recovers the same branch without source mutation',async()=>{
  const orderId=id(),operationId=id(),eventId=account.keyed(`event:transaction:${operationId}`),source={eventId,domain:'transaction',executor:'system:transaction-api',schemaVersion:1,operationId,action:'operations.transfer',target:orderId,effects:['audit','communication-qualification'],committedAt:time};
  await db.doc(`orders/${orderId}`).set({_ownerVersion:3,orderId,accountId:a.accountId,version:2,currentWork:'base',assignedStaffId:staff.staffId,status:'OPEN'});await db.doc(`orders/${orderId}/work/base`).set({componentId:'base',currentEdition:1,cancelled:false});await db.doc(`transactionOperations/${operationId}`).set({state:'committed',action:source.action,target:orderId,result:{orderId,componentId:'base',version:2}});await db.doc(`ownerEvents/${eventId}`).set(source);
  const service=createCommunicationService(account,config,{sourcePolicies:nativeCommunicationPolicies(account),origin:'http://127.0.0.1:5182'}),plan=await service.qualify(eventId,'native-transaction');
  // Native qualification returns Staff then Customer; inspect the durable intent
  // rather than guessing its order when choosing the Customer branch.
  let customerIntent;for(const id of plan.intentIds){if((await db.doc(`communicationIntents/${id}`).get()).data().domain==='customer')customerIntent=id;}
  const customerRoutes=await service.route(customerIntent),customerBranch=customerRoutes.branches[0].branchId;
  assert.equal((await service.bind(customerBranch)).state,'NO RENDER');assert.equal((await service.bind(customerBranch)).state,'NO RENDER');assert.equal((await db.doc(`communicationDeliveryIssues/${customerBranch}`).get()).data().version,1);assert.equal((await service.list(a,'customer')).records.some(row=>row.notificationId===customerBranch),false);
  const templateId='template:s15:customer:information',current=await config.read(staff,templateId),draft=await config.mutate(staff,{configurationId:templateId,action:'draft',operationId:id(),expectedVersion:current.version,value:defaultCommunicationCopy(templateId)}),activate=id();await config.mutate(staff,{configurationId:templateId,action:'activate',operationId:activate,expectedVersion:draft.version,proposedVersion:draft.proposedVersion});
  const original=(await db.doc(`orders/${orderId}`).get()).data(),system=createSystemMaintenance(account,{origin:'http://127.0.0.1:5182'});await system.processEvent(account.keyed(`event:configuration:${activate}`),workerPolicy);
  assert.equal((await db.doc(`notificationBindings/${customerBranch}`).get()).data().state,'AVAILABLE');assert.equal((await db.doc(`communicationDeliveryIssues/${customerBranch}`).get()).data().state,'RESOLVED');assert.equal((await db.doc(`communicationDeliveryIssues/${customerBranch}`).collection('history').get()).size,3);assert.deepEqual((await db.doc(`orders/${orderId}`).get()).data(),original);
});
