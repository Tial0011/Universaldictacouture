import { exactFields, fail } from './account-contract.js';

export const TAXONOMIES = Object.freeze(['SECURITY', 'ACTION REQUIRED', 'TRANSACTION UPDATE', 'INFORMATION', 'OPTIONAL NEWS']);
export const CHANNEL_POLICIES = Object.freeze(['REQUIRED', 'ELIGIBLE', 'CONDITIONALLY_REQUIRED', 'CONDITIONALLY_ELIGIBLE', 'NO_SEPARATE_CHANNEL']);
export const ROUTING_OUTCOMES = Object.freeze(['ROUTED', 'SUPPRESSED_BY_PREFERENCE', 'SUPPRESSED_BY_CONSENT', 'RECIPIENT_UNRESOLVED', 'ROUTE_UNAVAILABLE', 'UNSUPPORTED_CHANNEL', 'NO_ROUTE_REQUIRED', 'STALE_ROUTE_SUPPRESSED', 'PREFERENCE_UNRESOLVED']);
const variants = [
  ['customer', 'security', 'SECURITY', 'VIEW_ACCOUNT', [], 'Security update on your account', 'A security-related change was completed.'],
  ['customer', 'action', 'ACTION REQUIRED', 'VIEW_ORDER', ['order_reference'], 'Your approval is needed', 'Please review the latest update to your order.'],
  ['customer', 'transaction', 'TRANSACTION UPDATE', 'VIEW_ORDER', ['order_reference'], 'Your order has an update', 'Open your order to see the current details.'],
  ['customer', 'information', 'INFORMATION', 'VIEW_ORDER', ['approved_source_reference'], 'An update for you', 'Open the source to see the current details.'],
  ['customer', 'news', 'OPTIONAL NEWS', 'VIEW_COLLECTION', [], 'News from Universal Dicta Couture', 'Discover the latest from our house.'],
  ['staff', 'security', 'SECURITY', 'VIEW_STAFF_CONTEXT', [], 'Your access was changed', 'A change was made to your staff access.'],
  ['staff', 'action', 'ACTION REQUIRED', 'VIEW_ORDER', ['order_reference'], 'An order needs review', 'Open the source to review the current details.'],
  ['staff', 'transaction', 'TRANSACTION UPDATE', 'VIEW_ORDER', ['order_reference'], 'An order has an update', 'Open the source to see the current details.'],
  ['staff', 'information', 'INFORMATION', 'VIEW_ORDER', ['approved_source_reference'], 'Your order assignment changed', 'Open the source to see the current assignment.'],
];
export const COMMUNICATION_TEMPLATES = Object.freeze(Object.fromEntries(variants.map(([domain, family, taxonomy, semanticAction, required, heading, body]) => {
  const id = `template:s15:${domain}:${family}`;
  const allowedVariables = taxonomy === 'SECURITY' || taxonomy === 'OPTIONAL NEWS' ? ['display_name'] : ['display_name', 'order_reference', 'approved_source_reference', 'customer_safe_status'];
  const ctaLabels = semanticAction === 'VIEW_ORDER' ? ['View Order', 'Review Order'] : semanticAction === 'VIEW_ACCOUNT' ? ['Review Account Security'] : semanticAction === 'VIEW_COLLECTION' ? ['Explore the Collection'] : ['View Staff Context'];
  return [id, Object.freeze({ id, domain, family, taxonomy, semanticAction, required, allowedVariables, ctaLabels, heading, body, securityLocked: taxonomy === 'SECURITY', channels: taxonomy === 'OPTIONAL NEWS' ? ['email'] : ['in-app', 'email'] })];
})));
export function communicationTemplate(id) { const definition = COMMUNICATION_TEMPLATES[id]; if (!definition) fail('template-not-supported', 400); return definition; }
export function safeCopy(value, limit, required = true) {
  if (typeof value !== 'string' || value.length > limit || required && !value.trim() || /[<>]|https?:|www\.|javascript:|data:|\/\//i.test(value) || Array.from(value).some(character=>{const code=character.charCodeAt(0);return code===127||code<32&&![9,10,13].includes(code);})) fail('unsafe-template-copy', 400);
  return value;
}
export function validateCommunicationCopy(id, value) {
  const definition = communicationTemplate(id);
  exactFields(value, ['subject', 'preheader', 'heading', 'body', 'ctaLabel', 'support']);
  for (const [field, limit] of Object.entries({ subject: 150, preheader: 150, heading: 120, body: 2000, ctaLabel: 50, support: 200 })) safeCopy(value[field], limit, !['preheader', 'support'].includes(field));
  if (!definition.ctaLabels.includes(value.ctaLabel)) fail('template-cta-mismatch', 400);
  if (definition.securityLocked && (value.heading !== definition.heading || value.body !== definition.body)) fail('template-security-core-locked', 400);
  const used = new Set();
  for (const [field, text] of Object.entries(value)) {
    const leftovers = text.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => {
      if (!definition.allowedVariables.includes(key) || ['subject', 'preheader', 'ctaLabel'].includes(field)) fail('template-variable-denied', 400);
      used.add(key); return '';
    });
    if (/[{}]/.test(leftovers)) fail('template-expression-denied', 400);
  }
  if (definition.required.some(key => !used.has(key))) fail('template-required-variable', 400);
  return structuredClone(value);
}
export function defaultCommunicationCopy(id) {
  const d = communicationTemplate(id);
  return { subject: 'An update from Universal Dicta Couture', preheader: 'Sign in to see your current information.', heading: d.heading, body: d.body + (d.required.length ? `\nReference: {{${d.required[0]}}}` : ''), ctaLabel: d.ctaLabels[0], support: d.domain === 'customer' ? 'Need help? Chat with a Dicta Couturier.' : 'Contact your authorized team for support.' };
}
export function renderCommunication(id, value, context) {
  const d = communicationTemplate(id); validateCommunicationCopy(id, value); exactFields(context, d.allowedVariables);
  for (const [key, entry] of Object.entries(context)) safeCopy(entry, 200, d.required.includes(key));
  if (d.required.some(key => !context[key])) fail('template-context-required', 409);
  const render = text => text.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => context[key] || (key === 'display_name' ? d.domain === 'customer' ? 'Valued Customer' : 'Team' : ''));
  return {...Object.fromEntries(Object.entries(value).map(([key, text]) => [key, render(text)])),greeting:`Hello ${context.display_name|| (d.domain==='customer'?'Valued Customer':'Team')},`};
}
export function syntheticContext(id, preset = 'standard') {
  const d = communicationTemplate(id), sample = { display_name: preset === 'no-name' ? '' : preset === 'long' ? 'A synthetic customer with a deliberately long display name' : 'Sample Customer', order_reference: preset === 'long' ? 'UDC-SAMPLE-LONG-REFERENCE-FOR-WRAPPING' : 'UDC-SAMPLE-1047', approved_source_reference: 'UDC-SAMPLE-1047', customer_safe_status: 'Awaiting review' };
  if (!['standard', 'no-name', 'long'].includes(preset)) fail('invalid-preview-preset', 400);
  return Object.fromEntries(d.allowedVariables.map(key => [key, sample[key]]));
}
export function historyStart(domain, time) {
  if (domain === 'staff') return time - 180 * 86400000;
  const date = new Date(time), day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - 12);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(day, last)); return date.getTime();
}
export const badge = count => count == null ? null : count > 99 ? '99+' : String(count);
