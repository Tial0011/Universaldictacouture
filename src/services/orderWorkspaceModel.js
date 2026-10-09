// UX orientation only; the trusted owner rechecks every resulting command.
export function workLabel(id) { return id === 'base' ? 'Base Main Order' : `Extension ${id}`; }
export function nextOrderAction(order) {
  if (!order) return { title: 'Checking current work', state: 'checking' };
  if (order.cancelled) return { title: 'Cancelled · historical', state: 'terminal' };
  if (order.completed) return { title: 'Completed · historical', state: 'terminal' };
  if (!order.currentEdition) return { title: 'Establish commercial terms', action: 'establish-edition' };
  if (order.working) return { title: 'Review Working Changes', action: order.workingAmendment ? 'establish-amendment' : 'establish-edition' };
  if (order.businessApproval?.edition !== order.currentEdition) return { title: 'Business Approval required', action: 'business-approve' };
  if (order.customerApproval?.edition !== order.currentEdition) return { title: 'Await Customer Final Approval', state: 'waiting' };
  if (order.paymentEnabled?.edition !== order.currentEdition) return { title: 'Approval Complete · Payment not enabled', action: 'enable-payment' };
  if (order.amountDueNowMinor == null) return { title: 'Checking financial readiness', state: 'checking' };
  if (order.amountDueNowMinor > 0) return { title: 'Await verified Payment', state: 'waiting' };
  if (!order.assignedStaffId) return { title: 'Await authorized assignment', action: 'claim' };
  if (order.fulfilment === 'NOT STARTED') return { title: 'Review fulfilment readiness', action: 'start-fulfilment' };
  if (order.delivery === 'DELIVERED') return { title: 'Review Completion eligibility', action: 'complete' };
  if (order.delivery === 'DISPATCHED') return { title: 'Delivery in progress', state: 'waiting' };
  if (order.delivery === 'READY FOR DISPATCH') return { title: 'Review Dispatch', action: 'dispatch' };
  if (order.fulfilment === 'READY FOR DELIVERY PREPARATION') return { title: 'Review Delivery Context', action: 'ready-dispatch' };
  return { title: 'Continue fulfilment', state: 'working' };
}
export function frozenOrderCommand(order, action, extra = {}) {
  if (!order?.orderId || !order.componentId || !Number.isSafeInteger(order.version) || !Number.isSafeInteger(order.currentEdition)) throw new Error('Current target unavailable');
  return Object.freeze({ ...structuredClone(extra), orderId: order.orderId, componentId: order.componentId,
    expectedVersion: order.version, expectedEdition: order.currentEdition, action });
}
export function targetStillCurrent(target, order) {
  return Boolean(target && order && target.orderId === order.orderId && target.componentId === order.componentId
    && target.expectedVersion === order.version && target.expectedEdition === order.currentEdition);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])]));
  return value;
}
export function editionDifferences(from, to) {
  if (!Array.isArray(from?.entries) || !Array.isArray(to?.entries)) return { state: 'incomplete', records: [] };
  const first = new Map(from.entries.map(entry => [entry.rootId,entry])), second = new Map(to.entries.map(entry => [entry.rootId,entry]));
  if (first.has(undefined) || second.has(undefined) || first.size !== from.entries.length || second.size !== to.entries.length) return { state: 'incomplete', records: [] };
  const fields = ['label','quantity','unitAmountMinor','productId','options'];
  const records = [...new Set([...first.keys(),...second.keys()])].sort().flatMap(rootId => {
    const a = first.get(rootId), b = second.get(rootId);
    if (!a || !b) return [{ rootId, field: 'entry', state: a ? 'removed' : 'added', from: a?.label || null, to: b?.label || null }];
    return fields.flatMap(field => JSON.stringify(canonical(a[field])) === JSON.stringify(canonical(b[field])) ? [] : [{ rootId,field,state:'changed',from:a[field] ?? null,to:b[field] ?? null }]);
  });
  return { state: records.length ? 'changed' : 'unchanged', records };
}
