// Owner decision, 2026-10-09: promote existing active admins through the
// trusted repair command. A role title alone never grants this profile.
// Add future owner integrations here with their exact purpose/data contract.
export const SUPER_ADMIN_PROFILE = 'udc-super-admin-v1';
export const OWNER_PROFILE = 'udc-owner-v1';
export function superAdminCapabilities({ paymentReview = false } = {}) {
  const grants = {};
  const add = (domain, actions, purpose) => {
    for (const action of actions.split(' ')) grants[`${domain}.${action}`] = { domainWide: { active: true, purpose } };
  };
  const data = (capability, purpose, dataClass) => {
    grants[capability] = { ...grants[capability], dataPurpose: { active: true, purpose, allObjects: true, dataClasses: [dataClass] } };
  };
  add('products', 'read create edit commercial media discovery publish unpublish archive restore delete', 'catalogue');
  add('content', 'read edit delete', 'content');
  add('reviews', 'read moderate publish unpublish product-draft', 'moderation');
  data('reviews.media-read', 'moderation', 'review-media');
  add('chats', 'read reply send', 'customer-service');
  add('media', 'upload', 'public-media');
  add('audit', 'read', 'audit');
  data('audit.read', 'audit', 'audit-evidence');
  add('operations', 'reconcile', 'operation-result');
  add('customers', 'read', 'customer-support');
  data('customers.contact.read', 'customer-support', 'profile-contact');
  add('customStyle', 'read handoff', 'custom-style');
  data('customStyle.read', 'custom-style', 'custom-style-private');
  add('orders', 'read save-working save-amendment-working undo-working establish-edition establish-amendment business-approve enable-payment transfer remove-assignment start-fulfilment fulfilment-component work-complete delivery-preparation delivery-context ready-dispatch dispatch reconcile-delivery complete completion-correction cancel issue enable-review extension-propose extension-revise extension-activate extension-close activity-read', 'order-operations');
  for (const [action, dataClass] of [['origin-read','order-origin'],['delivery-read','delivery-context'],['operations-read','operational-context']]) data(`orders.${action}`, 'order-operations', dataClass);
  for (const action of ['read','add','correct','redact','history']) data(`orders.notes-${action}`, 'order-notes', 'operational-note');
  for (const action of ['read','create','review','resolve']) data(`orders.escalation-${action}`, 'order-governance', 'escalation');
  add('payments', 'read', 'payment-operations');
  if (paymentReview) for (const action of ['proof-read','verify']) data(`payments.${action}`, 'payment-evidence', 'payment-proof');
  add('notifications', 'read edit', 'personal-notifications');
  add('settings.templates', 'read edit', 'communication-settings');
  for (const action of ['read','edit']) data(`communications.delivery.${action}`, 'communication-reliability', 'delivery-evidence');
  // Newest owner decision explicitly includes financial administration.
  for (const action of ['read','edit']) grants[`settings.bank.${action}`] = { governance: { active:true, purpose:'financial-settings', area:'financial-settings', allObjects:true } };
  for (const action of ['restrict','delete-admin']) grants[`accounts.${action}`] = { governance: { active:true, purpose:'account-lifecycle', area:'account-lifecycle', allObjects:true } };
  data('accounts.deleted.read','account-lifecycle','tombstone');
  // No Customer approval, provider-event forgery, automatic assignment or
  // inferred Couturier availability. Source validation remains mandatory.
  return grants;
}
export function effectiveAdminCapabilities(record) {
  if(record.allCapabilitiesDisabled===true)return {};
  const capabilities={...record.capabilities,...superAdminCapabilities({paymentReview:record.paymentReview===true})};
  for(const key of record.disabledCapabilities || []) delete capabilities[key];
  return capabilities;
}
