import { identifier } from "./account-contract.js";

// Called inside the OWNER transaction, after all its reads. This carries only
// correlation, not a copied Profile, Payment Proof, message or business record.
export function captureIntent(tx, account, { domain, operationId, action, target, actor, executor, committedAt }) {
  const eventId = account.keyed(`event:${domain}:${identifier(operationId)}`);
  const effects = ["audit"];
  if (domain === 'transaction' && ['commercial.business-approve','payment.review','operations.claim','operations.transfer'].includes(action)) effects.push('communication-qualification');
  if(domain==='configuration'&&action==='activate'&&target.startsWith('template:s15:'))effects.push('communication-content-recheck');
  if (domain === "pretransaction" && action.startsWith("product.")) effects.push("product-projection");
  if (domain === "identity-resolution" || domain === "account" && ["account.delete", "restrict", "delete-admin"].includes(action)) effects.push("lifecycle-projection");
  tx.create(account.ref(`ownerEvents/${eventId}`), {
    eventId, domain, operationId, action, target, actor,
    executor, committedAt: committedAt ?? account.now(), effects, schemaVersion: 1,
  });
  return eventId;
}
