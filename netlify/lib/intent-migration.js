import { fail, identifier } from "./account-contract.js";

const sources = Object.freeze({ account: "accountOperations", pretransaction: "pretransactionOperations", transaction: "transactionOperations", configuration: "configurationOperations" });
// Resumable EXPAND/backfill port for individually reviewed existing receipts.
// It never retries an owner command or reconstructs missing actor/history.
// No public endpoint, destructive contracting or production cutover implied.
export function createIntentMigration(account) {
  return async function repair({ domain, operationId, expectedFingerprint }) {
    const collection = sources[domain]; if (!collection) fail("migration-source-unsupported", 400);
    identifier(operationId);
    return account.db.runTransaction(async tx => {
      const receipt = (await tx.get(account.ref(`${collection}/${operationId}`))).data();
      if (!receipt || receipt.state !== "committed" || !expectedFingerprint || receipt.fingerprint !== expectedFingerprint) fail("migration-evidence-required", 409);
      const eventId = account.keyed(`event:${domain}:${operationId}`), prior = (await tx.get(account.ref(`ownerEvents/${eventId}`))).data();
      if (prior) return { state: "already-present", eventId };
      const actor = receipt.actor || (receipt.actorKind === "customer" && receipt.accountId ? { kind: "customer", accountId: receipt.accountId } : null);
      if (!actor || !receipt.action || !receipt.target || !Number.isSafeInteger(receipt.createdAt) || receipt.createdAt <= 0) fail("migration-provenance-unavailable", 409);
      const minimalActor = actor.staffId ? { kind: "staff", staffId: identifier(actor.staffId) } : actor.accountId ? { kind: actor.kind, accountId: identifier(actor.accountId) } : null;
      if (!minimalActor) fail("migration-provenance-unavailable", 409);
      account.capture(tx, { domain, operationId, action: receipt.action, target: receipt.target, actor: minimalActor, executor: "system:receipt-intent-repair", committedAt: receipt.createdAt });
      return { state: "repaired", eventId };
    });
  };
}
