import { exactFields, fail, identifier } from './account-contract.js';

// Bounded Section-14 owner records beneath the existing Main Order. No new
// Order, Assignment, Attention, Chat, Payment or Audit authority is created.
export function createOrderGovernance(transactions) {
  const { db, ref, now, keyed, orderRef, workRef, authority, operation, isStaff } = transactions;
  const path = (orderId,kind,id) => orderRef(identifier(orderId)).collection(kind).doc(identifier(id));
  const reason = value => {
    if(typeof value!=='string'||!value.trim()||value.length>4000)fail('invalid-argument',400);
    return value.trim();
  };
  async function anchor(tx,claims,orderId,componentId) {
    if(!isStaff(claims))fail();
    const order=(await tx.get(orderRef(orderId))).data();if(order?.orderId!==orderId)fail();await authority(tx,claims,order,'read');
    const work=(await tx.get(workRef(orderId,componentId))).data();if(!work||work.componentId!==componentId)fail();
    return {order,work};
  }
  async function permit(tx,claims,order,kind,action) {
    return authority(tx,claims,order,`${kind}-${action}`,{purpose:kind==='notes'?'order-notes':'order-governance',
      dataClass:kind==='notes'?'operational-note':'escalation',objectId:order.orderId});
  }
  async function noteList(claims,orderId,componentId='base') {
    return db.runTransaction(async tx=>{
      const {order}=await anchor(tx,claims,orderId,componentId);await permit(tx,claims,order,'notes','read');
      const rows=await tx.get(orderRef(orderId).collection('operationalNotes').where('componentId','==',componentId).orderBy('__name__').limit(21));
      return {records:rows.docs.slice(0,20).map(row=>{const value=row.data();return {noteId:row.id,componentId,revision:value.revision,
        originalAuthor:value.originalAuthor,createdAt:value.createdAt,correctionActor:value.correctionActor||null,correctedAt:value.correctedAt||null,
        state:value.redacted?'REDACTED':value.revision>1?'CORRECTED':'ESTABLISHED',...(value.redacted?{}:{body:value.body})};}),complete:rows.size<=20};
    });
  }
  async function noteHistory(claims,orderId,noteId) {
    return db.runTransaction(async tx=>{
      const order=(await tx.get(orderRef(orderId))).data();if(order?.orderId!==orderId)fail();await authority(tx,claims,order,'read');
      await permit(tx,claims,order,'notes','history');
      const notePath=path(orderId,'operationalNotes',noteId),note=(await tx.get(notePath)).data();if(!note)fail();
      const rows=await tx.get(notePath.collection('revisions').orderBy('__name__').limit(20));
      // Redaction suppresses ordinary historical body as well. Retained bytes
      // are protected owner evidence, not an implicit unredacted reader grant.
      return {noteId,originalAuthor:note.originalAuthor,redacted:Boolean(note.redacted),records:rows.docs.map(row=>{
        const value=row.data();return {revision:value.revision,action:value.action,actor:value.actor,at:value.at,...(!note.redacted&&value.body?{body:value.body}:{})};
      }),complete:false};
    });
  }
  async function noteChange(claims,input) {
    exactFields(input,['operationId','orderId','componentId','expectedVersion','noteId','expectedRevision','action','body','reason']);
    if(!['add','correct','redact'].includes(input.action))fail('invalid-argument',400);
    const componentId=input.componentId||'base';
    return db.runTransaction(async tx=>{
      const {order}=await anchor(tx,claims,input.orderId,componentId);
      const actor=await permit(tx,claims,order,'notes',input.action);
      await permit(tx,claims,order,'notes','read');
      const op=await operation(tx,claims,input,`note.${input.action}`,`${order.orderId}:${componentId}`,actor);
      if(op.prior)return{state:'committed',...op.prior.result};
      if(order.version!==input.expectedVersion)fail('stale-conflict',409);
      const noteId=input.action==='add'?keyed(`note:${order.orderId}:${input.operationId}`):identifier(input.noteId);
      const notePath=path(order.orderId,'operationalNotes',noteId),prior=(await tx.get(notePath)).data();
      if(input.action==='add'&&prior||input.action!=='add'&&(!prior||prior.componentId!==componentId||prior.revision!==input.expectedRevision||prior.redacted))fail('stale-conflict',409);
      const revision=(prior?.revision||0)+1,at=now();
      const body=input.action==='redact'?null:reason(input.body);
      if(input.action==='redact')reason(input.reason);
      const next={...prior,noteId,componentId,revision,originalAuthor:prior?.originalAuthor||actor,createdAt:prior?.createdAt||at,
        ...(input.action==='redact'?{redacted:true,body:null,redactedBy:actor,redactedAt:at}:{body,redacted:false}),
        ...(input.action==='correct'?{correctionActor:actor,correctedAt:at}:{})};
      tx.set(notePath,next);tx.create(notePath.collection('revisions').doc(String(revision).padStart(8,'0')),
        {revision,action:input.action,actor,at,...(body?{body}:{}),...(input.action==='redact'?{reason:input.reason.trim()}:{})});
      return op.commit({orderId:order.orderId,componentId,noteId,revision,noteState:next.redacted?'REDACTED':revision>1?'CORRECTED':'ESTABLISHED'});
    });
  }
  async function source(tx,claims,order,work,kind,id) {
    if(kind==='work-issue') {
      const issue=work.issues?.[identifier(id)];if(!issue)fail();
      await authority(tx,claims,order,'operations-read',{dataClass:'operational-context'});
      return {kind,id,version:work.version,state:issue.resolved?'RESOLVED':'UNRESOLVED',qualifying:!issue.resolved};
    }
    if(kind==='payment') {
      const payment=(await tx.get(ref(`payments/${identifier(id)}`))).data();
      if(!payment||payment.orderId!==order.orderId||payment.componentId!==work.componentId)fail();
      await authority(tx,claims,order,'read',{domain:'payments',purpose:'payment-operations',objectId:order.orderId});
      return {kind,id,version:payment.version,state:payment.state,qualifying:payment.state==='NEEDS ATTENTION'&&!payment.supersededBy};
    }
    // Delivery Exception has no qualifying source-owner port in the baseline;
    // never manufacture one from a tracking event or free text.
    fail('source-unavailable',503);
  }
  async function escalationList(claims,orderId,componentId='base') {
    return db.runTransaction(async tx=>{
      const {order,work}=await anchor(tx,claims,orderId,componentId);await permit(tx,claims,order,'escalation','read');
      const rows=await tx.get(orderRef(orderId).collection('escalations').where('componentId','==',componentId).orderBy('__name__').limit(21));
      const records=[];
      for(const row of rows.docs){const value=row.data(),current=await source(tx,claims,order,work,value.sourceKind,value.sourceId);
        records.push({escalationId:row.id,componentId,revision:value.revision,state:value.state,source:current,
          reviewHandler:value.reviewHandler||null,outcome:value.outcome||null,createdAt:value.createdAt,
          requiredResponsibility:'Authorized Order Governance'});}
      return {records:records.slice(0,20),complete:rows.size<=20};
    });
  }
  async function escalationChange(claims,input) {
    exactFields(input,['operationId','orderId','componentId','expectedVersion','escalationId','expectedRevision','sourceKind','sourceId','expectedSourceVersion','action','reason','outcome']);
    if(!['create','review','resolve'].includes(input.action))fail('invalid-argument',400);
    const componentId=input.componentId||'base';
    return db.runTransaction(async tx=>{
      const {order,work}=await anchor(tx,claims,input.orderId,componentId);
      const actor=await permit(tx,claims,order,'escalation',input.action);await permit(tx,claims,order,'escalation','read');
      const op=await operation(tx,claims,input,`escalation.${input.action}`,`${order.orderId}:${componentId}`,actor);
      if(op.prior)return{state:'committed',...op.prior.result};
      if(order.version!==input.expectedVersion)fail('stale-conflict',409);
      const escalationId=input.action==='create'?keyed(`escalation:${order.orderId}:${componentId}:${input.sourceKind}:${identifier(input.sourceId)}`):identifier(input.escalationId);
      const target=path(order.orderId,'escalations',escalationId),prior=(await tx.get(target)).data();
      const current=await source(tx,claims,order,work,prior?.sourceKind||input.sourceKind,prior?.sourceId||input.sourceId);
      if(current.version!==input.expectedSourceVersion||prior&&prior.componentId!==componentId)fail('stale-conflict',409);
      if(input.action==='create'&&prior)return op.commit({orderId:order.orderId,componentId,escalationId,revision:prior.revision,escalationState:prior.state});
      if(input.action==='create'&&!current.qualifying||input.action!=='create'&&(!prior||prior.revision!==input.expectedRevision||prior.state==='RESOLVED'))fail('stale-conflict',409);
      if(input.action==='review'&&prior.state!=='OPEN')fail('stale-conflict',409);
      const revision=(prior?.revision||0)+1,at=now();
      const next={...prior,escalationId,componentId,sourceKind:current.kind,sourceId:current.id,revision,
        state:input.action==='create'?'OPEN':input.action==='review'?'UNDER REVIEW':'RESOLVED',createdAt:prior?.createdAt||at,
        createdBy:prior?.createdBy||actor,sourceVersion:current.version,
        ...(input.action==='create'?{reason:reason(input.reason)}:{reviewHandler:actor.staffId}),
        ...(input.action==='resolve'?{outcome:reason(input.outcome),resolvedAt:at,resolvedBy:actor}:{})};
      tx.set(target,next);tx.create(target.collection('history').doc(String(revision).padStart(8,'0')),
        {revision,action:input.action,state:next.state,actor,at,sourceVersion:current.version,...(input.action==='resolve'?{outcome:next.outcome}:{})});
      // Deliberately no write to Order/work, source issue, assignment or Attention.
      return op.commit({orderId:order.orderId,componentId,escalationId,revision,escalationState:next.state});
    });
  }
  return {noteList,noteHistory,noteChange,escalationList,escalationChange};
}
