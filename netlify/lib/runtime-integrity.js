import { AccountError, fail, identifier } from "./account-contract.js";
import { resolveStaff } from "./staff-authority.js";

export function failureClass(error) {
  if (!(error instanceof AccountError)) return "DEPENDENCY UNAVAILABLE / DEGRADED";
  if (/unknown|unconfirmed/.test(error.code)) return "OUTCOME UNKNOWN";
  if (error.code === "partial-completion") return "PARTIAL COMPLETION";
  if (error.code === "transient-technical-failure" || error.status === 429) return "TRANSIENT TECHNICAL FAILURE";
  if (/stale|conflict|state-changed/.test(error.code)) return "STALE / CONFLICT";
  if ([401, 403].includes(error.status)) return "AUTHORIZATION DENIAL";
  if ([400, 409, 413].includes(error.status)) return "VALIDATION / BUSINESS RULE REJECTION";
  if (error.status === 503) return "DEPENDENCY UNAVAILABLE / DEGRADED";
  return "PERMANENT TECHNICAL FAILURE";
}
export function safeObservation(error, correlationId = null) {
  return { kind: "technical-log", failureClass: failureClass(error), ...(correlationId && /^[a-f0-9]{64}$/.test(correlationId) ? { correlationId } : {}) };
}
export function createRuntimeIntegrity(account) {
  const { db, ref, now } = account;
  async function auditRead(claims, auditId) {
    identifier(auditId);
    return db.runTransaction(async tx => {
      await resolveStaff(tx, db, claims, { capability: "audit.read", purpose: "audit", objectId: auditId, action: "read", dataClass: "audit-evidence" }, now());
      const value = (await tx.get(ref(`formalAudit/${auditId}`))).data();
      if (!value) fail("not-found", 404);
      const fields = ["actor", "originalExecutor", "executor", "action", "target", "domain", "operationId", "eventId", "committedAt", "capturedAt", "result"];
      return Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
    });
  }
  async function inspect() {
    const issues = [], counts = {}, collections = ["accounts", "staffIdentities", "orders", "payments", "sharedConfiguration"];
    let complete = true;
    for (const collection of collections) {
      const rows = await db.collection(collection).limit(200).get(); counts[collection] = rows.size;
      if (rows.size === 200) complete = false;
      for (const row of rows.docs) {
        const value = row.data();
        const issue = code => issues.push({ area: collection, targetId: row.id, code });
        if (collection === "accounts") {
          const binding = value.principalUid ? (await ref(`accountBindings/${value.principalUid}`).get()).data() : null;
          if (!binding || binding.accountId !== row.id || binding.epoch !== value.epoch) issue("account-binding-incoherent");
          if (value.lifecycle?.startsWith("DELETED-") && binding?.active) issue("deleted-binding-active");
          if (value.canonicalAccountId && binding?.active) issue("merged-source-active");
        }
        if (collection === "staffIdentities" && value.active) {
          const member = value.principalUid ? (await ref(`admins/${value.principalUid}`).get()).data() : null;
          if (!member || member.staffId !== row.id || member.sharedAccount || value.principalUids?.length > 1) issue("staff-binding-incoherent");
        }
        if (collection === "orders" && value._ownerVersion === 3) {
          const chat = (await ref(`accountConversations/${value.chatId}`).get()).data(), base = (await ref(`orders/${row.id}/work/base`).get()).data();
          if (value.chatId !== `order:${row.id}` || chat?.orderId !== row.id || chat?.accountId !== value.accountId) issue("transaction-chat-incoherent");
          if (!value.originalSnapshot || !base) issue("transaction-origin-unavailable");
          if (value.currentWork !== (value.activeExtensionId || "base")) issue("current-work-incoherent");
          const work = (await ref(`orders/${row.id}/work/${value.currentWork}`).get()).data();
          if (!work) issue("current-work-missing");
          else if (work.currentEdition && !(await ref(`orders/${row.id}/work/${value.currentWork}/editions/${work.currentEdition}`).get()).exists) issue("current-edition-missing");
          if (value.activeExtensionId && (work?.completed || work?.cancelled)) issue("terminal-extension-active");
        }
        if (collection === "payments" && value.state === "VERIFIED") {
          const decision = value.verifiedDecisionId ? (await ref(`paymentDecisions/${value.verifiedDecisionId}`).get()).data() : null;
          if (!decision || decision.paymentId !== row.id || decision.decision !== "VERIFIED" || decision.proofReferenceId !== value.proofReferenceId || decision.verifiedAmountMinor !== value.verifiedAmountMinor) issue("verified-payment-evidence-incoherent");
        }
        if (collection === "sharedConfiguration" && value.effectiveVersion && !(await ref(`sharedConfiguration/${row.id}/versions/${value.effectiveVersion}`).get()).exists) issue("effective-configuration-missing");
      }
    }
    return { state: complete && !issues.length ? "coherent" : "unresolved", complete, issues, counts, checkedAt: now(), readOnly: true };
  }
  return { inspect, auditRead };
}

// No restore/import or production switch is implicit. Trusted recovery tooling
// supplies actual verification functions against current surviving evidence.
export async function verifyRecovery({ integrity, verifiers, restorationId }) {
  identifier(restorationId);
  const baseline = await integrity.inspect(), checks = [];
  for (const gate of ["identity-security", "references-history", "application-readiness", "current-authority", "projection-readiness"]) {
    if (typeof verifiers?.[gate] !== "function") checks.push({ gate, state: "unavailable" });
    else {
      try { const result = await verifiers[gate]({ restorationId, baseline }); checks.push({ gate, state: result?.state === "passed" && result.evidenceId ? "passed" : "unresolved", ...(result?.evidenceId ? { evidenceId: identifier(result.evidenceId) } : {}) }); }
      catch { checks.push({ gate, state: "unavailable" }); }
    }
  }
  const verified = baseline.state === "coherent" && checks.every(check => check.state === "passed");
  return { restorationId, state: verified ? "verified-recovery" : "unresolved-recovery", mayExpose: verified, checks, baseline };
}
