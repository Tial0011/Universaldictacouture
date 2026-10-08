import { randomUUID } from "node:crypto";
import { fail, identifier } from "./account-contract.js";

// Internal system port only; never accept handlers, policy or event payloads
// from a browser. Numeric lease/retry policy is supplied by reviewed operations,
// not invented here. A missing policy keeps external work closed.
export function createDownstreamWorker(account, handlers = {}) {
  const { db, ref, keyed, now } = account;
  async function materialize(eventId, effect = "audit") {
    identifier(eventId); identifier(effect);
    return db.runTransaction(async tx => {
      const event = (await tx.get(ref(`ownerEvents/${eventId}`))).data();
      if (!event || !event.effects.includes(effect)) fail();
      const jobId = keyed(`job:${eventId}:${effect}`), path = ref(`downstreamJobs/${jobId}`);
      const prior = (await tx.get(path)).data();
      if (!prior) tx.create(path, { jobId, eventId, effect, state: "pending", attempts: 0, lease: null });
      return { jobId, state: prior?.state || "pending" };
    });
  }
  async function run(jobId, policy) {
    identifier(jobId);
    if (!Number.isSafeInteger(policy?.leaseMs) || policy.leaseMs <= 0 || !Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1) fail("worker-policy-required", 503);
    const leaseId = randomUUID(), path = ref(`downstreamJobs/${jobId}`);
    const job = await db.runTransaction(async tx => {
      const current = (await tx.get(path)).data();
      if (!current) fail();
      if (["applied", "suppressed", "needs-attention"].includes(current.state)) return current;
      if (current.lease?.expiresAt > now()) return { ...current, busy: true };
      if (current.attempts >= policy.maxAttempts && current.state !== "unknown") {
        tx.update(path, { state: "needs-attention", lease: null }); return { ...current, state: "needs-attention" };
      }
      tx.update(path, { state: "running", lease: { id: leaseId, expiresAt: now() + policy.leaseMs } });
      return current;
    });
    if (job.busy || ["applied", "suppressed", "needs-attention"].includes(job.state)) return { state: job.busy ? "busy" : job.state };
    const event = (await ref(`ownerEvents/${job.eventId}`).get()).data();
    const handler = job.effect === "audit" ? auditHandler : handlers[job.effect];
    let state = "unknown";
    try {
      if (!event || !handler) fail("worker-dependency-unavailable", 503);
      // Reconcile BEFORE every possible application, including an expired lease
      // left by a process that crashed after the external effect.
      const known = await handler.reconcile({ jobId, event });
      if (known === "applied") state = "applied";
      else if (known === "not-applied") {
        if (job.attempts >= policy.maxAttempts) state = "needs-attention";
        else {
          const eligible = await handler.eligible({ jobId, event });
          if (!eligible) state = "suppressed";
          else {
            // The handler must also enforce current source/recipient eligibility
            // at its own irreversible effect boundary, not just this preflight.
            await db.runTransaction(async tx => {
              const latest = (await tx.get(path)).data();
              if (latest.lease?.id !== leaseId || latest.lease.expiresAt <= now()) fail("lease-lost", 409);
              tx.update(path, { attempts: latest.attempts + 1 });
              tx.create(ref(`downstreamAttempts/${leaseId}`), { jobId, executor: "system:downstream-worker", startedAt: now() });
            });
            const outcome = await handler.apply({ jobId, event, leaseId });
            if (!["applied", "suppressed", "unknown", "not-applied"].includes(outcome)) fail("effect-outcome-unknown", 503);
            state = outcome === "not-applied" ? "pending" : outcome;
          }
        }
      }
    } catch { state = "unknown"; } // No exception/PII dump, and never assume failure.
    await db.runTransaction(async tx => {
      const latest = (await tx.get(path)).data(), attempt = await tx.get(ref(`downstreamAttempts/${leaseId}`));
      if (latest.lease?.id !== leaseId) return; // stale executor cannot overwrite newer work
      tx.update(path, { state, lease: null, observedAt: now() });
      if (attempt.exists) tx.update(attempt.ref, { state, observedAt: now() });
    });
    return { state };
  }
  const auditHandler = {
    reconcile: async ({ jobId }) => (await ref(`formalAudit/${jobId}`).get()).exists ? "applied" : "not-applied",
    eligible: async () => true,
    apply: async ({ jobId, event }) => db.runTransaction(async tx => {
      const path = ref(`formalAudit/${jobId}`), prior = await tx.get(path);
      if (!prior.exists) tx.create(path, { actor: event.actor, originalExecutor: event.executor, executor: "system:audit-worker", action: event.action, target: event.target, domain: event.domain, operationId: event.operationId, eventId: event.eventId, committedAt: event.committedAt, capturedAt: now(), result: "committed" });
      return "applied";
    }),
  };
  return { materialize, run };
}
