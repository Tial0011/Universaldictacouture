import { randomUUID } from 'node:crypto';
import { exactFields, fail, identifier, emailKey } from './account-contract.js';
import { resolveStaff, resolveStaffIdentity } from './staff-authority.js';
import { communicationTemplate, renderCommunication, historyStart, badge, TAXONOMIES, CHANNEL_POLICIES, safeCopy } from './communication-contract.js';
import { createDownstreamWorker } from './downstream-worker.js';
import { authorizationRoutes } from '../../src/services/staffAuthorization.js';
import { communicationEmail } from './communication-email.js';

// Section-15 owner of communication meaning, built on the existing Section-16
// outbox/worker/configuration. Source contracts are trusted server closures, never
// browser-supplied plans, recipients, permissions, destinations or source data.
export function createCommunicationService(account, configuration, { sourcePolicies = {}, provider, workerPolicy, attentionOwner, origin } = {}) {
  const { db, ref, keyed, now, customer, auth, secret } = account;
  const key = (domain, recipientId) => `${domain}:${identifier(recipientId)}`;
  const policies = new Map(Object.entries(sourcePolicies));
  async function identity(tx, claims, domain, action = 'read') {
    if (domain === 'customer') { const owner = await customer(tx, claims); return { domain, recipientId: owner.accountId, actor: { kind: 'customer', accountId: owner.accountId }, recipientKey: key(domain, owner.accountId) }; }
    if (domain !== 'staff') fail('invalid-argument',400);
    const staff = await resolveStaffIdentity(tx, db, claims, now());
    await resolveStaff(tx, db, claims, { capability: `notifications.${action}`, purpose: 'personal-notifications', objectId: staff.staffId, action }, now());
    return { domain, recipientId: staff.staffId, actor: { kind: 'staff', staffId: staff.staffId }, recipientKey: key(domain,staff.staffId) };
  }
  async function qualify(eventId, policyId, occurrence = null) {
    identifier(eventId); identifier(policyId);
    if(occurrence!=null)identifier(occurrence);
    const port = policies.get(policyId); if (!port?.qualify || !port?.current) fail('communication-policy-unavailable',503);
    if (occurrence != null && !port.reminder) fail('reminder-not-permitted',409);
    const planId = keyed(`signal:${eventId}:${policyId}:${occurrence || 'original'}`);
    return db.runTransaction(async tx => {
      const event = (await tx.get(ref(`ownerEvents/${eventId}`))).data();
      if (!event || event.eventId !== eventId || event.schemaVersion !== 1 || !event.executor?.startsWith('system:')) fail('communication-source-unavailable',409);
      const prior = (await tx.get(ref(`communicationPlans/${planId}`))).data(); if (prior) return { planId, state: prior.state, intentIds: prior.intentIds };
      const intents = occurrence == null ? await port.qualify(tx,event) : await port.reminder(tx,event,occurrence,now());
      if (!Array.isArray(intents) || intents.length > 10) fail('communication-policy-unresolved',503);
      const rows = intents.map(intent => {
        exactFields(intent,['purpose','domain','taxonomy','templateId','source','sourceVersion','privacyClass','mandatory','optionalPreference','consentRequired','channels','recipientIds','context','policyVersion']);
        const definition = communicationTemplate(intent.templateId);
        if (!TAXONOMIES.includes(intent.taxonomy) || intent.taxonomy !== definition.taxonomy || intent.domain !== definition.domain || typeof intent.mandatory !== 'boolean' || !Number.isSafeInteger(intent.sourceVersion) || !intent.privacyClass || !intent.policyVersion) fail('invalid-signal-plan',503);
        if (!Array.isArray(intent.recipientIds) || intent.recipientIds.length > 20 || !Array.isArray(intent.channels)) fail('invalid-signal-plan',503);
        if (intent.taxonomy === 'OPTIONAL NEWS' && (intent.domain !== 'customer' || intent.mandatory || intent.channels.some(c => c.channel !== 'email'))) fail('optional-news-policy-denied',503);
        for (const branch of intent.channels) if (!CHANNEL_POLICIES.includes(branch.policy)) fail('invalid-channel-policy',503);
        // Context is checked against the purpose-specific allowlist even before
        // a template exists. No proof, transcript, address or Bank payload enters.
        exactFields(intent.context,definition.allowedVariables);
        for(const value of Object.values(intent.context))safeCopy(value,200,false);
        const intentId = keyed(`intent:${planId}:${identifier(intent.purpose)}:${intent.domain}`);
        return { ...intent, intentId, planId, policyId, eventId, occurrence, createdAt: now() };
      });
      if (new Set(rows.map(row=>row.intentId)).size !== rows.length) fail('signal-purpose-conflict',503);
      for (const row of rows) tx.create(ref(`communicationIntents/${row.intentId}`),row);
      const state = rows.length ? 'QUALIFIED' : 'NO_COMMUNICATION';
      tx.create(ref(`communicationPlans/${planId}`),{planId,eventId,policyId,occurrence,state,intentIds:rows.map(row=>row.intentId),createdAt:now()});
      return {planId,state,intentIds:rows.map(row=>row.intentId)};
    });
  }
  async function recipient(tx,intent,recipientId) {
    if (intent.domain === 'customer') {
      const owner = (await tx.get(ref(`accounts/${recipientId}`))).data();
      const binding = owner?.principalUid ? (await tx.get(ref(`accountBindings/${owner.principalUid}`))).data() : null;
      if (!owner || !['ACTIVE','RESTORED'].includes(owner.lifecycle) || owner.canonicalAccountId || !binding?.active || binding.accountId !== recipientId || binding.epoch !== owner.epoch) return { outcome:'RECIPIENT_UNRESOLVED' };
      if (!intent.mandatory) {
        const preferences = (await tx.get(ref(`accountPreferences/${recipientId}`))).data();
        if (!intent.optionalPreference || !Object.hasOwn(preferences || {},intent.optionalPreference)) return {outcome:'PREFERENCE_UNRESOLVED'};
        if (preferences[intent.optionalPreference] !== true) return {outcome:'SUPPRESSED_BY_PREFERENCE'};
      }
      return {outcome:'ROUTED',uid:owner.principalUid,epoch:owner.epoch,loginKey:owner.loginKey};
    }
    const registry = (await tx.get(ref(`staffIdentities/${recipientId}`))).data();
    const membership = registry?.principalUid ? (await tx.get(ref(`admins/${registry.principalUid}`))).data() : null;
    if (!registry?.active || registry.staffId !== recipientId || !membership?.active || membership.staffId !== recipientId || membership.sharedAccount || registry.principalUids?.length > 1) return {outcome:'RECIPIENT_UNRESOLVED'};
    if (!intent.mandatory && intent.optionalPreference) {
      const preference = (await tx.get(ref(`staffCommunicationPreferences/${recipientId}`))).data();
      if (preference?.[intent.optionalPreference] !== true) return {outcome:preference ? 'SUPPRESSED_BY_PREFERENCE' : 'PREFERENCE_UNRESOLVED'};
    }
    return {outcome:'ROUTED',uid:registry.principalUid,staffId:recipientId};
  }
  async function eligibility(tx,intent,recipientId,channel) {
    const route = await recipient(tx,intent,recipientId);
    if (route.outcome !== 'ROUTED') return route;
    const policy = policies.get(intent.policyId), event = (await tx.get(ref(`ownerEvents/${intent.eventId}`))).data();
    if (!policy || !event) return {outcome:'STALE_ROUTE_SUPPRESSED'};
    const current = await policy.current(tx,event,intent,recipientId,channel);
    if (current?.applicable !== true) return {outcome:current?.unknown ? 'RECIPIENT_UNRESOLVED' : 'STALE_ROUTE_SUPPRESSED'};
    if (intent.consentRequired && current.consent !== true) return {outcome:'SUPPRESSED_BY_CONSENT'};
    return {...route,current};
  }
  async function route(intentId) {
    identifier(intentId);
    return db.runTransaction(async tx => {
      const intent = (await tx.get(ref(`communicationIntents/${intentId}`))).data(); if (!intent) fail();
      const decisions=[];
      // The source policy chooses the exact intended set. No admins collection
      // scan, universal broadcast or zero-recipient substitute exists here.
      if (!intent.recipientIds.length) return {state:'RECIPIENT_UNRESOLVED',branches:[]};
      for (const recipientId of new Set(intent.recipientIds)) for (const requested of intent.channels) {
        const {channel,policy} = requested, branchId=keyed(`branch:${intentId}:${key(intent.domain,recipientId)}:${channel}`);
        const prior=(await tx.get(ref(`notificationBindings/${branchId}`))).data();
        if (prior) {decisions.push({branchId,outcome:prior.routingOutcome});continue;}
        let state;
        if (policy === 'NO_SEPARATE_CHANNEL') state={outcome:'NO_ROUTE_REQUIRED'};
        else if (!['in-app','email'].includes(channel)) state={outcome:'UNSUPPORTED_CHANNEL'};
        else if (policy.startsWith('CONDITIONALLY_') && typeof policies.get(intent.policyId)?.channelEligible !== 'function') state={outcome:'ROUTE_UNAVAILABLE'};
        else if (policy.startsWith('CONDITIONALLY_') && !await policies.get(intent.policyId).channelEligible(tx,intent,recipientId,channel)) state={outcome:'NO_ROUTE_REQUIRED'};
        else state=await eligibility(tx,intent,recipientId,channel);
        decisions.push({branchId,outcome:state.outcome,intent,recipientId,channel,policy});
      }
      // Firestore transactions require every read to precede every write.
      for (const decision of decisions.filter(d=>d.intent)) tx.create(ref(`notificationBindings/${decision.branchId}`),{schemaVersion:2,branchId:decision.branchId,intentId,templateId:intent.templateId,domain:intent.domain,recipientId:decision.recipientId,recipientKey:key(intent.domain,decision.recipientId),channel:decision.channel,channelPolicy:decision.policy,routingOutcome:decision.outcome,state:decision.outcome === 'ROUTED' ? 'ROUTED' : decision.outcome,render:null,createdAt:now(),version:1});
      return {state:'ROUTING_DECIDED',branches:decisions.map(({branchId,outcome})=>({branchId,outcome}))};
    });
  }
  async function bind(branchId) {
    identifier(branchId);
    return db.runTransaction(async tx=>{
      const path=ref(`notificationBindings/${branchId}`), branch=(await tx.get(path)).data(); if (!branch || branch.schemaVersion !== 2) fail();
      if(branch.render) return {branchId,jobId:keyed(`communication-job:${branchId}`),state:branch.state};
      if(branch.routingOutcome!=='ROUTED')return{branchId,state:branch.routingOutcome};
      const intent=(await tx.get(ref(`communicationIntents/${branch.intentId}`))).data();
      const current=await eligibility(tx,intent,branch.recipientId,branch.channel);
      if(current.outcome!=='ROUTED') {tx.update(path,{state:'STALE/SUPPRESSED BEFORE DISPATCH',routingOutcome:current.outcome,version:branch.version+1});return{branchId,state:current.outcome};}
      const noRender=async()=>{
        const issueRef=ref(`communicationDeliveryIssues/${branchId}`),issue=(await tx.get(issueRef)).data();
        if(branch.state==='NO RENDER'&&issue?.state==='OPEN')return{branchId,state:'NO RENDER'};
        tx.update(path,{state:'NO RENDER',version:branch.version+1});
        tx.set(issueRef,{branchId,domain:branch.domain,recipientKey:branch.recipientKey,channel:branch.channel,state:'OPEN',version:(issue?.version||0)+1,reason:'Required communication content unavailable',humanActionRequired:true,updatedAt:now()});
        tx.create(issueRef.collection('history').doc(String((issue?.version||0)+1)),{version:(issue?.version||0)+1,state:'OPEN',reason:'Required communication content unavailable',at:now(),executor:'system:communication-bind'});
        return{branchId,state:'NO RENDER'};
      };
      const template=await configuration.effective(tx,intent.templateId);
      if(!template)return noRender();
      let render,email=null;
      try {
        render=renderCommunication(intent.templateId,template.value,intent.context);
        if(branch.channel==='email'){
          const definition=communicationTemplate(intent.templateId),route=current.current?.route||({VIEW_ACCOUNT:'/profile',VIEW_STAFF_CONTEXT:'/admin/settings',VIEW_COLLECTION:'/shop'}[definition.semanticAction]);
          email=communicationEmail(render,{origin,route});
        }
      } catch(error) {if(error.status>=500)throw error;return noRender();}
      const jobId=keyed(`communication-job:${branchId}`);
      const issueRef=ref(`communicationDeliveryIssues/${branchId}`),issue=(await tx.get(issueRef)).data();
      tx.update(path,{render,email,renderId:keyed(`render:${branchId}:${template.effectiveVersion}`),templateId:intent.templateId,templateVersion:template.effectiveVersion,state:'CONTENT BOUND',version:branch.version+1});
      tx.create(ref(`downstreamJobs/${jobId}`),{jobId,eventId:intent.eventId,effect:'communication',branchId,state:'pending',attempts:0,lease:null});
      if(issue){tx.update(issueRef,{state:'RECOVERING',humanActionRequired:false,reason:'Content bound; delivery remains pending',version:issue.version+1,updatedAt:now()});tx.create(issueRef.collection('history').doc(String(issue.version+1)),{version:issue.version+1,state:'RECOVERING',reason:'Content bound; delivery remains pending',at:now(),executor:'system:communication-bind'});}
      return{branchId,jobId,state:'CONTENT BOUND'};
    });
  }
  async function jobBranch(jobId) {const job=(await ref(`downstreamJobs/${jobId}`).get()).data();return job?.effect==='communication'?job.branchId:null;}
  async function currentBranch(branchId) {
    return db.runTransaction(async tx=>{const branch=(await tx.get(ref(`notificationBindings/${branchId}`))).data();if(!branch)return null;const intent=(await tx.get(ref(`communicationIntents/${branch.intentId}`))).data();if(!intent)return null;return{branch,intent,...await eligibility(tx,intent,branch.recipientId,branch.channel)};});
  }
  const handler={
    reconcile:async({jobId})=>{
      const branchId=await jobBranch(jobId);if(!branchId)return'unknown';
      const branch=(await ref(`notificationBindings/${branchId}`).get()).data();
      if(branch.state==='AVAILABLE'||['PROVIDER ACCEPTED','PROVIDER-REPORTED DELIVERED'].includes(branch.state))return'applied';
      if(branch.state==='TERMINAL FAILURE'&&branch.lastEvidence)return'applied'; // send happened; a bounce is not permission to duplicate it
      if(branch.channel==='in-app')return'not-applied';
      if(!provider?.reconcile)return'unknown';
      const result=await provider.reconcile(branchId);
      if(result==='applied'){await recordEvidence(branchId,{evidenceId:`reconcile:${jobId}`,kind:'PROVIDER ACCEPTED',providerTime:now(),timeBasis:'OBSERVATION',attemptId:jobId});return'applied';}
      return result==='not-applied'?'not-applied':'unknown';
    },
    eligible:async({jobId})=>{const branchId=await jobBranch(jobId), current=branchId?await currentBranch(branchId):null;return current?.outcome==='ROUTED';},
    apply:async({jobId,leaseId})=>{
      const branchId=await jobBranch(jobId);let current=branchId?await currentBranch(branchId):null;if(current?.outcome!=='ROUTED')return'suppressed';
      if(current.branch.channel==='in-app')return db.runTransaction(async tx=>{
        const path=ref(`notificationBindings/${branchId}`),branch=(await tx.get(path)).data(),intent=(await tx.get(ref(`communicationIntents/${branch.intentId}`))).data();
        if((await eligibility(tx,intent,branch.recipientId,'in-app')).outcome!=='ROUTED')return'suppressed';
        const issueRef=ref(`communicationDeliveryIssues/${branchId}`),issue=(await tx.get(issueRef)).data();
        if(branch.state!=='AVAILABLE')tx.update(path,{state:'AVAILABLE',availableAt:now(),version:branch.version+1});
        if(issue&&issue.state!=='RESOLVED'){tx.update(issueRef,{state:'RESOLVED',humanActionRequired:false,reason:'In-App communication available',version:issue.version+1,updatedAt:now()});tx.create(issueRef.collection('history').doc(String(issue.version+1)),{version:issue.version+1,state:'RESOLVED',reason:'In-App communication available',at:now(),executor:'system:communication-worker'});}
        return'applied';
      });
      if(!provider?.send)return'unknown';
      const destination=await auth.getUser(current.uid); if(!destination.emailVerified||destination.disabled||!destination.email)return'suppressed';
      if(current.branch.domain==='customer'&&emailKey(destination.email,secret)!==current.loginKey)return'suppressed';
      const latest=await currentBranch(branchId);if(latest?.outcome!=='ROUTED'||latest.uid!==current.uid||latest.epoch!==current.epoch)return'suppressed';current=latest;
      const sendDestination=await auth.getUser(current.uid);
      if(!sendDestination.emailVerified||sendDestination.disabled||!sendDestination.email||sendDestination.email!==destination.email)return'suppressed';
      if(current.branch.domain==='customer'&&emailKey(sendDestination.email,secret)!==current.loginKey)return'suppressed';
      const boundary=await currentBranch(branchId);if(boundary?.outcome!=='ROUTED'||boundary.uid!==current.uid||boundary.epoch!==current.epoch||boundary.loginKey!==current.loginKey)return'suppressed';current=boundary;
      const definition=communicationTemplate(current.intent.templateId),route=current.current?.route||({VIEW_ACCOUNT:'/profile',VIEW_STAFF_CONTEXT:'/admin/settings',VIEW_COLLECTION:'/shop'}[definition.semanticAction]);
      const email=current.branch.email||communicationEmail(current.branch.render,{origin,route});
      const result=await provider.send({idempotencyKey:branchId,destination:sendDestination.email,render:current.branch.render,email,semanticAction:definition.semanticAction});
      if(result?.state!=='applied')return'unknown';
      await recordEvidence(branchId,{evidenceId:`accepted:${leaseId}`,attemptId:leaseId,kind:'PROVIDER ACCEPTED',providerTime:now(),timeBasis:'OBSERVATION'});return'applied';
    },
  };
  const runtimeWorker=createDownstreamWorker(account,{communication:handler});
  async function execute(jobId,policy) {
    const result=await runtimeWorker.run(jobId,policy);
    const job=(await ref(`downstreamJobs/${jobId}`).get()).data();
    if(job?.effect!=='communication'||!job.branchId)return result;
    if(['unknown','pending','needs-attention','suppressed'].includes(result.state))await db.runTransaction(async tx=>{
      const branch=(await tx.get(ref(`notificationBindings/${job.branchId}`))).data(),issueRef=ref(`communicationDeliveryIssues/${job.branchId}`),issue=(await tx.get(issueRef)).data();if(!branch)return;
      const state=result.state==='suppressed'?'RESOLVED':result.state==='pending'?'RECOVERING':'OPEN';
      const reason=result.state==='suppressed'?'Communication no longer applicable':result.state==='needs-attention'?'Bounded recovery needs authorized attention':result.state==='pending'?'Retry pending':provider?'Outcome could not be confirmed':'Communication route unavailable';
      if(!issue&&state==='RESOLVED'||issue?.state===state&&issue?.reason===reason)return;
      const version=(issue?.version||0)+1;
      tx.set(issueRef,{branchId:job.branchId,domain:branch.domain,recipientKey:branch.recipientKey,channel:branch.channel,state,version,reason,humanActionRequired:result.state==='needs-attention',updatedAt:now()});
      tx.create(issueRef.collection('history').doc(String(version)),{version,state,reason,at:now(),executor:'system:communication-worker'});
    });
    return result;
  }
  const worker={...runtimeWorker,run:execute};
  // Verified provider adapter only. This is not exposed as a browser command.
  async function recordEvidence(branchId,evidence) {
    exactFields(evidence,['evidenceId','attemptId','kind','providerTime','timeBasis']);
    identifier(branchId);identifier(evidence.evidenceId);identifier(evidence.attemptId);
    if(!['PROVIDER ACCEPTED','PROVIDER-REPORTED DELIVERED','TERMINAL FAILURE','RETRY PENDING','OUTCOME UNCERTAIN'].includes(evidence.kind)||!Number.isSafeInteger(evidence.providerTime))fail('invalid-provider-evidence',400);
    return db.runTransaction(async tx=>{
      const path=ref(`notificationBindings/${branchId}`),branch=(await tx.get(path)).data();if(!branch||branch.channel!=='email')fail();
      const jobId=keyed(`communication-job:${branchId}`),job=(await tx.get(ref(`downstreamJobs/${jobId}`))).data();
      const attempt=evidence.attemptId===jobId?null:(await tx.get(ref(`downstreamAttempts/${evidence.attemptId}`))).data();
      const reconciliation=evidence.attemptId===jobId&&evidence.evidenceId===`reconcile:${jobId}`&&evidence.kind==='PROVIDER ACCEPTED'&&job?.attempts>0;
      if(!job||job.branchId!==branchId||!(reconciliation||attempt?.jobId===jobId))fail('provider-attempt-association-denied',409);
      const evidenceRef=ref(`notificationDelivery/${keyed(`${branchId}:${evidence.evidenceId}`)}`),prior=(await tx.get(evidenceRef)).data();
      const fingerprint=keyed(JSON.stringify(evidence));if(prior){if(prior.fingerprint!==fingerprint)fail('provider-evidence-conflict',409);return{state:branch.state};}
      // Time describes evidence within the exact branch; late earlier callback
      // cannot erase a later authoritative bounce. This is NOT a success ladder.
      if(evidence.timeBasis&&!['PROVIDER','OBSERVATION'].includes(evidence.timeBasis))fail('invalid-provider-evidence',400);
      const previousObservation=branch.lastEvidence?.timeBasis==='OBSERVATION',observation=evidence.timeBasis==='OBSERVATION';
      const ambiguous=branch.lastEvidence&&observation===previousObservation&&evidence.providerTime===branch.lastEvidence.providerTime&&evidence.kind!==branch.lastEvidence.kind;
      const isCurrent=!branch.lastEvidence||previousObservation&&!observation||observation===previousObservation&&(ambiguous||evidence.providerTime>branch.lastEvidence.providerTime||evidence.providerTime===branch.lastEvidence.providerTime&&evidence.kind===branch.lastEvidence.kind);
      const currentKind=ambiguous?'OUTCOME UNCERTAIN':evidence.kind;
      const issueRef=ref(`communicationDeliveryIssues/${branchId}`),issue=(await tx.get(issueRef)).data();
      tx.create(evidenceRef,{branchId,...evidence,fingerprint,observedAt:now()});
      if(isCurrent){const issueState=['PROVIDER ACCEPTED','PROVIDER-REPORTED DELIVERED'].includes(currentKind)?'RESOLVED':currentKind==='RETRY PENDING'?'RECOVERING':'OPEN',reason=currentKind==='OUTCOME UNCERTAIN'?'Outcome could not be confirmed':currentKind==='TERMINAL FAILURE'?'Delivery failed':'Provider evidence updated';tx.update(path,{state:currentKind,lastEvidence:ambiguous?{...evidence,kind:'OUTCOME UNCERTAIN'}:evidence,version:branch.version+1});if(issue||issueState!=='RESOLVED'){tx.set(issueRef,{branchId,domain:branch.domain,recipientKey:branch.recipientKey,channel:'email',state:issueState,version:(issue?.version||0)+1,reason,updatedAt:now(),humanActionRequired:false});tx.create(issueRef.collection('history').doc(String((issue?.version||0)+1)),{version:(issue?.version||0)+1,state:issueState,reason,at:now(),executor:'system:provider-reconciliation'});}}
      return{state:isCurrent?currentKind:branch.state};
    });
  }
  async function visible(tx,claims,owner,branch,state) {
    if(branch.schemaVersion!==2||branch.recipientKey!==owner.recipientKey||branch.channel!=='in-app'||branch.state!=='AVAILABLE'||state?.archived)return null;
    const intent=(await tx.get(ref(`communicationIntents/${branch.intentId}`))).data(); if(!intent)return null;
    const policy=policies.get(intent.policyId),event=(await tx.get(ref(`ownerEvents/${intent.eventId}`))).data();
    let presentation={visibility:'HIDDEN',actionability:'ACTIONABILITY_UNCONFIRMED',route:null};
    if(policy?.presentation&&event)presentation=await policy.presentation(tx,event,intent,claims,owner);
    if(!['FULL','MINIMIZED','EXISTENCE_ONLY'].includes(presentation.visibility))return null;
    const minimal=presentation.visibility!=='FULL';
    return{notificationId:branch.branchId,version:state?.version||0,taxonomy:intent.taxonomy,heading:minimal?'Historical notification':branch.render.heading,body:minimal?'Details are not available in your current access scope.':branch.render.body,createdAt:branch.createdAt,read:state?.read===true,visibility:presentation.visibility,actionability:presentation.actionability||'ACTIONABILITY_UNCONFIRMED',canOpen:Boolean(presentation.route),ctaLabel:minimal?'View source':branch.render.ctaLabel,sourceGroup:!minimal&&intent.source.orderId?{key:keyed(`communication-context:${owner.recipientKey}:${intent.source.orderId}`),label:intent.context.order_reference||intent.context.approved_source_reference||'Your UDC order'}:null};
  }
  async function list(claims,domain,input={}) {
    exactFields(input,['filter','before']);const allowed=domain==='staff'?['all','unread','security']:['all','unread','action-required'];if(!allowed.includes(input.filter||'all'))fail('invalid-filter',400);
    return db.runTransaction(async tx=>{
      const owner=await identity(tx,claims,domain),rows=await tx.get(db.collection('notificationBindings').where('recipientKey','==',owner.recipientKey).where('channel','==','in-app').where('createdAt','>=',historyStart(domain,now())).orderBy('createdAt','desc'));
      const records=[];for(const row of rows.docs){const branch=row.data(),state=(await tx.get(ref(`notificationStates/${branch.branchId}`))).data();const item=await visible(tx,claims,owner,branch,state);if(item)records.push(item);}
      // Count/pagination depend ONLY on currently permitted presentation. Raw
      // hidden-row totals must not alter badges, continuation or response states.
      // Query is owner/domain/channel/UX-window bounded, not a realtime listener.
      const unreadCount=records.filter(r=>!r.read).length;
      const filtered=records.filter(row=>(input.filter!=='unread'||!row.read)&&(input.filter!=='security'||row.taxonomy==='SECURITY')&&(input.filter!=='action-required'||row.taxonomy==='ACTION REQUIRED'&&row.actionability==='ACTIONABLE_CONFIRMED'));
      const offset=input.before?filtered.findIndex(row=>row.notificationId===input.before)+1:0;if(input.before&&offset===0)fail('stale-page',409);
      const page=filtered.slice(offset,offset+30);
      return{domain,records:page,count:unreadCount,badge:badge(unreadCount),counts:{all:records.length,unread:unreadCount,security:records.filter(row=>row.taxonomy==='SECURITY').length,'action-required':records.filter(row=>row.taxonomy==='ACTION REQUIRED'&&row.actionability==='ACTIONABLE_CONFIRMED').length},state:'READY',next:offset+page.length<filtered.length?page.at(-1)?.notificationId:null};
    });
  }
  async function change(claims,domain,input) {
    exactFields(input,['notificationId','action','operationId','expectedVersion','undoToken']);identifier(input.notificationId);identifier(input.operationId);
    if(!['read','archive','undo'].includes(input.action))fail('invalid-argument',400);
    return db.runTransaction(async tx=>{
      const owner=await identity(tx,claims,domain,'edit'),branch=(await tx.get(ref(`notificationBindings/${input.notificationId}`))).data(),path=ref(`notificationStates/${input.notificationId}`),state=(await tx.get(path)).data();
      if(!branch||branch.recipientKey!==owner.recipientKey)fail();
      const operationRef=ref(`communicationOperations/${input.operationId}`),prior=(await tx.get(operationRef)).data(),fingerprint=keyed(JSON.stringify({uid:claims.uid,domain,input}));
      if(prior){if(prior.fingerprint!==fingerprint||!await account.ownsResult(tx,claims,prior,input.operationId,'communication'))fail();return{state:'committed',...prior.result};}
      if((state?.version||0)!==input.expectedVersion)fail('stale-conflict',409);
      if(input.action!=='undo'&&!await visible(tx,claims,owner,branch,state))fail();
      const sessionId=claims._session?.id; if(!sessionId)fail('session-required',401);
      if(input.action==='undo'&&(!state?.archived||state.undoSession!==sessionId||state.undoExpiresAt<=now()||state.undoToken!==input.undoToken))fail('undo-expired',409);
      // Undo still rechecks current history permission, not just token possession.
      if(input.action==='undo'&&!await visible(tx,claims,owner,branch,{...state,archived:false}))fail();
      const token=input.action==='archive'?randomUUID():null,version=(state?.version||0)+1;
      const next={recipientKey:owner.recipientKey,version,read:input.action==='read'?true:state?.read===true,archived:input.action==='archive',undoToken:token,undoSession:input.action==='archive'?sessionId:null,undoExpiresAt:input.action==='archive'?now()+10000:null,updatedAt:now()};
      const result={notificationId:input.notificationId,version,undoToken:token,undoExpiresAt:next.undoExpiresAt};
      tx.set(path,next);tx.create(operationRef,{actorUid:claims.uid,actor:owner.actor,fingerprint,result,state:'committed',createdAt:now()});account.capture(tx,{domain:'communication',operationId:input.operationId,action:`notification.${input.action}`,target:input.notificationId,actor:owner.actor,executor:'system:communication-api'});return{state:'committed',...result};
    });
  }
  async function reconcile(claims,domain,operationId) {
    identifier(operationId);return db.runTransaction(async tx=>{await identity(tx,claims,domain);const prior=(await tx.get(ref(`communicationOperations/${operationId}`))).data();return await account.ownsResult(tx,claims,prior,operationId,'communication')?{state:'committed',...prior.result}:{state:'unknown'};});
  }
  async function markAll(claims,domain,input) {
    exactFields(input,['operationId']);identifier(input.operationId);
    return db.runTransaction(async tx=>{
      const owner=await identity(tx,claims,domain,'edit'),operationRef=ref(`communicationOperations/${input.operationId}`),prior=(await tx.get(operationRef)).data(),fingerprint=keyed(JSON.stringify({uid:claims.uid,domain,input,action:'mark-all'}));
      if(prior){if(prior.fingerprint!==fingerprint||!await account.ownsResult(tx,claims,prior,input.operationId,'communication'))fail();return{state:'committed',...prior.result};}
      const rows=await tx.get(db.collection('notificationBindings').where('recipientKey','==',owner.recipientKey).where('channel','==','in-app').where('createdAt','>=',historyStart(domain,now())).orderBy('createdAt','desc'));
      const changes=[];
      for(const row of rows.docs){const path=ref(`notificationStates/${row.id}`),state=(await tx.get(path)).data();if(!state?.read&&await visible(tx,claims,owner,row.data(),state))changes.push({path,state});}
      if(changes.length>400)fail('notification-bulk-too-large',409); // technical write budget; no partial mark-all claim
      // One owner-authorized command: read/archive presentation only, never
      // marks hidden records or completes a source action/Attention task.
      for(const {path,state} of changes)tx.set(path,{...state,recipientKey:owner.recipientKey,version:(state?.version||0)+1,read:true,archived:false,updatedAt:now()});
      const result={changed:changes.length};tx.create(operationRef,{actorUid:claims.uid,actor:owner.actor,fingerprint,result,state:'committed',createdAt:now()});account.capture(tx,{domain:'communication',operationId:input.operationId,action:'notification.mark-all',target:owner.recipientId,actor:owner.actor,executor:'system:communication-api'});return{state:'committed',...result};
    });
  }
  async function open(claims,domain,notificationId) {
    identifier(notificationId);return db.runTransaction(async tx=>{
      const owner=await identity(tx,claims,domain),branch=(await tx.get(ref(`notificationBindings/${notificationId}`))).data(),state=(await tx.get(ref(`notificationStates/${notificationId}`))).data();
      if(!branch||!await visible(tx,claims,owner,branch,state))fail();
      const intent=(await tx.get(ref(`communicationIntents/${branch.intentId}`))).data(),event=(await tx.get(ref(`ownerEvents/${intent.eventId}`))).data(),policy=policies.get(intent.policyId);
      const presentation=policy?.presentation&&event?await policy.presentation(tx,event,intent,claims,owner):null;
      return presentation?.route?{state:'CURRENT SOURCE',route:presentation.route}:{state:'ACCESS UNAVAILABLE',route:null};
    });
  }
  async function issueAccess(tx,claims,branchId,action) {return resolveStaff(tx,db,claims,{capability:`communications.delivery.${action}`,purpose:'communication-reliability',objectId:branchId,action,dataClass:'delivery-evidence'},now());}
  async function issues(claims) {
    return db.runTransaction(async tx=>{
      const staff=await resolveStaffIdentity(tx,db,claims,now());
      const routes=authorizationRoutes(staff,'communications.delivery.read','communication-reliability').filter(route=>route.family==='dataPurpose'&&Array.isArray(route.dataClasses)&&route.dataClasses.includes('delivery-evidence'));
      const ids=new Set(routes.flatMap(route=>Array.isArray(route.ids)?route.ids:[])),records=[];
      // Explicit all-object data-purpose authority still uses a bounded query
      // and the same current per-object authorization before disclosure.
      if(routes.some(route=>route.allObjects===true)) {
        const page=await tx.get(db.collection('communicationDeliveryIssues').limit(101));
        for(const row of page.docs)ids.add(row.id);
      }
      for(const id of ids){identifier(id);try{await issueAccess(tx,claims,id,'read');}catch(error){if(error.status===403)continue;throw error;}const issue=(await tx.get(ref(`communicationDeliveryIssues/${id}`))).data();if(issue)records.push({branchId:id,state:issue.state,domain:issue.domain,channel:issue.channel,reason:issue.reason,version:issue.version,humanActionRequired:issue.humanActionRequired});}
      return{records:records.slice(0,100),state:records.length>100?'PARTIALLY AVAILABLE':'READY'};
    });
  }
  async function recover(claims,input) {
    exactFields(input,['branchId','action']);identifier(input.branchId);if(!['recheck','retry','attention','open-source'].includes(input.action))fail('invalid-argument',400);
    if(input.action==='open-source')return db.runTransaction(async tx=>{
      const staff=await issueAccess(tx,claims,input.branchId,'read'),branch=(await tx.get(ref(`notificationBindings/${input.branchId}`))).data();if(!branch)fail();
      const intent=(await tx.get(ref(`communicationIntents/${branch.intentId}`))).data(),event=(await tx.get(ref(`ownerEvents/${intent.eventId}`))).data(),policy=policies.get(intent.policyId);
      const presentation=policy?.presentation&&event?await policy.presentation(tx,event,intent,claims,{domain:'staff',recipientId:staff.staffId}):null;
      return presentation?.route?{state:'CURRENT SOURCE',route:presentation.route}:{state:'ACCESS UNAVAILABLE',route:null};
    });
    await db.runTransaction(async tx=>issueAccess(tx,claims,input.branchId,'edit'));
    if(input.action==='attention'){if(!attentionOwner?.handoff)fail('attention-owner-unavailable',503);return attentionOwner.handoff({claims,branchId:input.branchId});}
    const jobId=keyed(`communication-job:${input.branchId}`),job=(await ref(`downstreamJobs/${jobId}`).get()).data();if(!job)fail('delivery-job-unavailable',409);
    if(input.action==='recheck')return{state:await handler.reconcile({jobId})};
    if(!workerPolicy)fail('worker-policy-required',503);
    const known=await handler.reconcile({jobId});
    if(known==='applied')return{state:'ALREADY APPLIED; RETRY UNAVAILABLE'};
    if(known!=='not-applied')return{state:'OUTCOME UNCERTAIN'};
    // Existing worker rechecks eligibility/lease and reconciles once more. The
    // same branch/render is retried; recipient identity never changes here.
    await db.runTransaction(async tx=>issueAccess(tx,claims,input.branchId,'edit'));
    return worker.run(jobId,workerPolicy);
  }
  async function issueDetail(claims,branchId) {
    identifier(branchId);return db.runTransaction(async tx=>{
      await issueAccess(tx,claims,branchId,'read');
      const issue=(await tx.get(ref(`communicationDeliveryIssues/${branchId}`))).data(),branch=(await tx.get(ref(`notificationBindings/${branchId}`))).data();if(!issue||!branch)fail();
      const jobId=keyed(`communication-job:${branchId}`),job=(await tx.get(ref(`downstreamJobs/${jobId}`))).data();
      const attempts=await tx.get(db.collection('downstreamAttempts').where('jobId','==',jobId).orderBy('startedAt','desc').limit(20)),evidence=await tx.get(db.collection('notificationDelivery').where('branchId','==',branchId).orderBy('observedAt','desc').limit(20));
      return{branchId,version:issue.version,domain:issue.domain,channel:branch.channel,state:issue.state,reason:issue.reason,deliveryState:branch.state,templateVersion:branch.templateVersion||null,attempts:attempts.docs.map(row=>({state:row.data().state||'PROCESSING',startedAt:row.data().startedAt,observedAt:row.data().observedAt||null})),evidence:evidence.docs.map(row=>({kind:row.data().kind,providerTime:row.data().providerTime,timeBasis:row.data().timeBasis||'PROVIDER',observedAt:row.data().observedAt})),retryConfigured:Boolean(workerPolicy&&provider?.reconcile&&provider?.send),attemptBudgetRemaining:Boolean(workerPolicy&&job&&job.attempts<workerPolicy.maxAttempts),historyPartial:attempts.size===20||evidence.size===20,humanActionRequired:issue.humanActionRequired};
    });
  }
  return{qualify,route,bind,list,change,markAll,reconcile,open,recordEvidence,issues,issueDetail,recover,handler,worker,currentBranch};
}
