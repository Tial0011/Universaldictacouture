import { AccountError, fail, identifier } from './account-contract.js';
import { completeStaffRoute, resolveStaffIdentity } from './staff-authority.js';
import { authorizationRoutes } from '../../src/services/staffAuthorization.js';

// Read composition only. Commands continue to commit through the existing
// transaction owner. No projection, viewed Edition or returned action grants
// permission to mutate a source record.
export function createOrderWorkspace(transactions) {
  const { db, now, authority, orderRef, workRef, financial, isStaff } = transactions;
  const actions = ['save-working','save-amendment-working','undo-working','establish-edition','establish-amendment',
    'business-approve','enable-payment','extension-propose','extension-revise','extension-activate','extension-close',
    'claim','transfer','remove-assignment','start-fulfilment','fulfilment-component','work-complete',
    'delivery-preparation','delivery-context','ready-dispatch','dispatch','complete','completion-correction',
    'request-cancellation','cancel','issue','enable-review'];
  async function context(tx, claims, orderId, componentId) {
    const order = (await tx.get(orderRef(identifier(orderId)))).data();
    if(order?.orderId!==orderId)fail();
    await authority(tx, claims, order, 'read');
    const work = (await tx.get(workRef(orderId, identifier(componentId)))).data();
    if (!work || work.componentId !== componentId) fail();
    if(!Number.isSafeInteger(order.version)||order.version<1||!Number.isSafeInteger(work.version)||work.version<1||!Number.isSafeInteger(work.currentEdition)||work.currentEdition<0)fail('source-unavailable',503);
    return { order, work };
  }
  async function read(claims, orderId, componentId = 'base') {
    if (!isStaff(claims)) fail();
    return db.runTransaction(async tx => {
      const { order, work } = await context(tx, claims, orderId, componentId);
      const staff = await resolveStaffIdentity(tx, db, claims, now());
      const can = (action, extra = {}) => completeStaffRoute(staff, {
        capability: `orders.${action}`, purpose: 'order-operations', objectId: orderId,
        assignedStaffId: order.assignedStaffId, state: order.status, action, ...extra,
      }, claims, now());
      const edition = work.currentEdition ? (await tx.get(workRef(orderId, componentId).collection('editions').doc(String(work.currentEdition)))).data() : null;
      let ledger,financialState='ready';
      try { ledger=await financial(tx, orderId, componentId); }
      catch(error){
        if(!(error instanceof AccountError)||error.code!=='financial-source-unavailable')throw error;
        financialState='unavailable';ledger={totalPaidMinor:null,outstandingMinor:null,amountDueNowMinor:null};
      }
      const result = { orderId, componentId, version: order.version, currentWork: order.currentWork,
        reference: typeof order.publicReference === 'string' && order.publicReference.length <= 120 ? order.publicReference : order.orderId,
        status: order.status, createdAt: order.createdAt, currentEdition: work.currentEdition, edition,
        assignedStaffId: order.assignedStaffId, businessApproval: work.businessApproval,
        customerApproval: work.customerApproval, paymentEnabled: work.paymentEnabled,
        fulfilment: work.fulfilment, delivery: work.delivery, completed: work.completed, cancelled: work.cancelled,
        reviewEnabled: order.reviewEnabled, chatId: order.chatId, activeExtensionId: order.activeExtensionId,
        financialState, actions: actions.filter(action => can(action, action === 'claim' ? {couturier:true,newWork:true} : {})), ...ledger };
      result.governanceActions = ['notes-read','notes-add','notes-correct','notes-redact','notes-history',
        'escalation-read','escalation-create','escalation-review','escalation-resolve'].filter(action=>completeStaffRoute(staff,{
          capability:`orders.${action}`,purpose:action.startsWith('notes-')?'order-notes':'order-governance',objectId:orderId,
          assignedStaffId:order.assignedStaffId,state:order.status,action,
          dataClass:action.startsWith('notes-')?'operational-note':'escalation'},claims,now()));
      if (can('save-working') || can('save-amendment-working') || can('establish-edition') || can('establish-amendment')) {
        result.workingVersion = work.workingVersion;
        result.working = work.working;
        result.workingAmendment = Boolean(work.workingAmendment);
      }
      // General Order/assignment access never grants private delivery fields.
      if (can('delivery-read', { dataClass: 'delivery-context' })) {
        result.deliveryContext = work.deliveryContext;
        result.deliveryContextVersion = work.deliveryContextVersion;
        result.dispatchReadinessCurrent=work.readyForDispatchContextVersion===work.deliveryContextVersion&&work.readyForDispatchEdition===work.currentEdition;
      }
      if (can('operations-read', { dataClass: 'operational-context' })) {
        result.operational = { workVersion:work.version, issues: work.issues || {}, fulfilmentComponents: work.fulfilmentComponents || {},
          workComplete: Boolean(work.workComplete), cancellationRequested: work.cancellationRequested || null,
          dispatchId: work.dispatchId || null, completionId: work.completionId || null };
      }
      return result;
    });
  }
  async function original(claims, orderId) {
    return db.runTransaction(async tx => {
      const order = (await tx.get(orderRef(identifier(orderId)))).data();
      if(order?.orderId!==orderId)fail();
      await authority(tx, claims, order, 'origin-read', { dataClass: isStaff(claims) ? 'order-origin' : null });
      const source = order.originalSnapshot;
      if (!source) return { orderId, state: 'incomplete', entries: null };
      // Never copy private request fields/measurements, Profile/contact, address
      // or raw media into the commercial comparison or generic workspace.
      return { orderId, state: Array.isArray(source.items) ? 'captured' : 'partial', capturedAt: source.capturedAt,
        sourceType: order.sourceType || 'custom-style', entries: Array.isArray(source.items) ? source.items.map(entry => ({
          rootId: entry.rootId, label: entry.label, quantity: entry.quantity, unitAmountMinor: entry.unitAmountMinor,
          options: entry.options || {}, ...(entry.productId ? { productId: entry.productId } : {}),
        })) : null };
    });
  }
  async function summary(claims,orderId){
    if(!isStaff(claims))fail();
    return db.runTransaction(async tx=>{
      const order=(await tx.get(orderRef(orderId))).data();if(order?.orderId!==orderId)fail();await authority(tx,claims,order,'read');
      const work=(await tx.get(workRef(orderId,order.currentWork))).data();if(!work)fail();
      return {orderId,reference:typeof order.publicReference==='string'&&order.publicReference.length<=120?order.publicReference:orderId,
        version:order.version,status:order.status,currentWork:order.currentWork,currentEdition:work.currentEdition,
        assignedStaffId:order.assignedStaffId,fulfilment:work.fulfilment,delivery:work.delivery,workCompleted:Boolean(work.completed),workCancelled:Boolean(work.cancelled)};
    });
  }
  async function payments(claims, orderId, componentId = 'base', before = null) {
    if (before != null) identifier(before);
    return db.runTransaction(async tx => {
      const { order } = await context(tx, claims, orderId, componentId);
      // Exact read admission is independent of assignment and proof access.
      await authority(tx, claims, order, 'read', { domain: 'payments', purpose: 'payment-operations', objectId: orderId });
      let query = db.collection('payments').where('orderId','==',orderId).where('componentId','==',componentId).orderBy('__name__');
      if (before) query = query.startAfter(before);
      const rows = await tx.get(query.limit(21));
      const records = rows.docs.slice(0,20).map(row => {
        const value = row.data();
        return { paymentId: row.id, orderId, componentId, version: value.version, paymentState: value.state,
          amountMinor: value.amountMinor, submittedAt: value.submittedAt, correctsPaymentId: value.correctsPaymentId || null,
          supersededBy: value.supersededBy || null };
      });
      return { records, next: rows.size > 20 ? records.at(-1).paymentId : null };
    });
  }
  async function extensions(claims, orderId) {
    return db.runTransaction(async tx => {
      await context(tx, claims, orderId, 'base');
      const rows = await tx.get(orderRef(orderId).collection('extensions').orderBy('__name__').limit(21));
      return { records: rows.docs.slice(0,20).map(row => {
        const value = row.data();
        return { extensionId: row.id, revision: value.revision, state: value.state, terms: value.terms,
          acceptedRevision: value.acceptedRevision || null };
      }), complete: rows.size <= 20 };
    });
  }
  async function activity(claims, orderId, componentId = 'base', after = null) {
    if (!isStaff(claims)) fail();
    if (after != null) identifier(after);
    return db.runTransaction(async tx => {
      const { order } = await context(tx, claims, orderId, componentId);
      await authority(tx, claims, order, 'activity-read');
      let query = db.collection('orderOperationalHistory').where('orderId','==',orderId).where('componentId','==',componentId).orderBy('__name__');
      if (after) query = query.startAfter(after);
      const rows = await tx.get(query.limit(21));
      return { records: rows.docs.slice(0,20).map(row => {
        const value = row.data();
        return { id: row.id, action: value.action, edition: value.edition, actor: value.actor, at: value.at };
      }), next: rows.size > 20 ? rows.docs[19].id : null, source: 'order-operational-transitions' };
    });
  }
  async function queue(claims, term = '') {
    if (!isStaff(claims) || typeof term !== 'string' || term.length > 200) fail();
    return db.runTransaction(async tx => {
      const staff = await resolveStaffIdentity(tx, db, claims, now());
      // Discovery entitlement is checked before any broad source query. Each
      // candidate then independently reauthorizes before payload/count.
      const routes = authorizationRoutes(staff,'orders.read','order-operations').filter(route => !route.actions || Array.isArray(route.actions) && route.actions.includes('read'));
      const wide=routes.some(route=>route.family==='domainWide');
      const assigned=wide||routes.some(route=>route.family==='assignmentDerived'&&staff.functionAsCouturier&&staff.eligible);
      const selected=[...new Set(routes.filter(route=>route.family==='selectedObject').flatMap(route=>Array.isArray(route.ids)?route.ids:[]))].slice(0,100);
      if(!wide&&!assigned&&!selected.length)fail();
      const candidates=new Map(),records=[];
      // Prioritize the actual current assignee query so a bounded Team scan
      // cannot omit newly assigned My Work merely because its ID sorts later.
      if(assigned){const rows=await tx.get(db.collection('orders').where('assignedStaffId','==',staff.staffId).limit(100));for(const row of rows.docs)candidates.set(row.id,row);}
      if(wide){const rows=await tx.get(db.collection('orders').limit(100));for(const row of rows.docs)candidates.set(row.id,row);}
      else for(const value of selected){const row=await tx.get(orderRef(identifier(value)));if(row.exists)candidates.set(row.id,row);}
      for (const row of candidates.values()) {
        const order = row.data(); if (order._ownerVersion !== 3||order.orderId!==row.id) continue;
        try { await authority(tx, claims, order, 'read'); }
        catch (error) { if (error instanceof AccountError && [401,403].includes(error.status)) continue; throw error; }
        if (!`${row.id} ${typeof order.publicReference==='string'?order.publicReference:''} ${order.status}`.toLocaleLowerCase().includes(term.toLocaleLowerCase())) continue;
        const work = (await tx.get(workRef(row.id, order.currentWork))).data();
        if (!work) continue;
        records.push({ orderId: row.id, reference: typeof order.publicReference === 'string' && order.publicReference.length <= 120 ? order.publicReference : row.id, version: order.version, currentWork: order.currentWork,
          assignedStaffId: order.assignedStaffId, status: order.status, currentEdition: work.currentEdition,
          workCompleted:Boolean(work.completed),workCancelled:Boolean(work.cancelled),
          fulfilment: work.fulfilment, delivery: work.delivery,
          claimable: !order.assignedStaffId && !work.completed && !work.cancelled && completeStaffRoute(staff, {
            capability: 'orders.claim', purpose: 'order-operations', objectId: row.id, state: order.status,
            action: 'claim', couturier: true, newWork: true }, claims, now()) });
      }
      // A bounded scan is intentionally not claimed to be the full queue. No
      // raw scanned count or cursor can disclose inaccessible source existence.
      return { records, count: records.length, complete: false, source: 'current-orders' };
    });
  }
  return { read, original, payments, extensions, activity, queue, summary };
}
