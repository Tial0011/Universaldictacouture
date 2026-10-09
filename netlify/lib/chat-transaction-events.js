// Only explicit owner commands qualify. No raw document-write trigger, private
// reason, bank instruction, proof locator or operational-note body is copied.
const titles = Object.freeze({
  'commercial.establish-edition': 'Order Edition established',
  'commercial.establish-amendment': 'Amendment Edition established',
  'commercial.business-approve': 'Business Approval confirmed',
  'commercial.customer-approve': 'Customer Final Approval confirmed',
  'commercial.enable-payment': 'Payment enabled · Bank Transfer only',
  'payment.submit': 'Payment Record submitted · Awaiting review',
  'payment.review': 'Payment Record reviewed',
  'extension.accept': 'Extension proposal accepted',
  'extension.activate': 'Extension activated in this Main Order',
  'extension.close': 'Extension closed',
  'operations.assign': 'Couturier responsibility updated',
  'operations.transfer': 'Couturier responsibility transferred',
  'operations.start-fulfilment': 'Fulfilment started',
  'operations.dispatch': 'Delivery dispatched',
  'operations.delivered': 'Delivery confirmed · Order completion is separate',
  'operations.complete': 'Order work completed',
  'operations.cancel': 'Order work cancelled',
});

export async function prepareChatTransactionEvent({ tx, ref, keyed, now, input, action, actor }) {
  if (!titles[action]) return null;
  let orderId = input.orderId, componentId = input.componentId || 'base';
  if (action.startsWith('payment.')) {
    const payment = (await tx.get(ref(`${action === 'payment.submit' ? 'paymentIntents' : 'payments'}/${input.paymentId}`))).data();
    orderId = payment?.orderId; componentId = payment?.componentId || 'base';
  }
  if (!orderId) return null;
  const order = (await tx.get(ref(`orders/${orderId}`))).data();
  if (!order?.chatId) return null;
  const chatPath = ref(`accountConversations/${order.chatId}`), chat = (await tx.get(chatPath)).data();
  if (chat?._ownerVersion !== 3 || chat.kind !== 'transaction' || chat.orderId !== orderId || chat.accountId !== order.accountId) return null;
  const messageId = keyed(`system-message:${chat.chatId}:${input.operationId}`);
  return {
    commit(result) {
      const edition = result.edition || input.expectedEdition || null;
      const body = `${titles[action]}${edition ? ` · Edition ${edition}` : ''}${result.paymentState ? ` · ${result.paymentState}` : ''}`;
      tx.create(chatPath.collection('messages').doc(messageId), {
        messageId, chatId: chat.chatId, kind: 'transaction-event', body,
        actor: { kind: 'system' }, actorLabel: 'Order update', originalActor: actor,
        sourceOperationId: input.operationId, sourceAction: action,
        eventTarget: { orderId, componentId: result.componentId || componentId, edition, paymentId: result.paymentId || null, extensionId: result.extensionId || null },
        executor: 'system:qualified-chat-consequence', version: 1,
        sequence: (chat.sequence || 0) + 1, createdAt: now(), attachmentReferenceIds: [],
      });
      tx.update(chatPath, { sequence: (chat.sequence || 0) + 1, updatedAt: now() });
    },
  };
}
