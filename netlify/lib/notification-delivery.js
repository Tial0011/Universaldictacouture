import { emailKey, fail, identifier } from "./account-contract.js";
import { renderTemplate } from "./shared-configuration.js";

// Owner-policy admission only. No browser, free-text Chat, setting or retry may
// create notification eligibility. The caller is trusted owner/Section-15 code.
export function createNotificationDelivery(account, configuration, { provider, sourceApplicable } = {}) {
  const { db, ref, keyed, now, auth, secret } = account;
  async function bind({ eventId, accountId, category, context }) {
    identifier(eventId); identifier(accountId);
    if (!["security", "transactional", "couturierAlerts", "styleCircle"].includes(category)) fail("notification-category-denied", 400);
    const jobId = keyed(`notification:${eventId}:${accountId}:${category}`);
    return db.runTransaction(async tx => {
      const event = (await tx.get(ref(`ownerEvents/${eventId}`))).data();
      if (!event || typeof sourceApplicable !== "function" || !await sourceApplicable(tx, event, accountId, category)) fail("notification-source-ineligible", 409);
      const path = ref(`notificationBindings/${jobId}`), prior = (await tx.get(path)).data();
      const fingerprint = keyed(JSON.stringify({ eventId, accountId, category, context }));
      if (prior) { if (prior.fingerprint !== fingerprint) fail("operation-conflict", 409); return { jobId }; }
      const template = await configuration.effective(tx, `template:${category}`);
      if (!template) fail("template-source-unavailable", 503);
      const render = renderTemplate(template.value, context);
      tx.create(path, { jobId, eventId, accountId, category, templateId: template.configurationId, templateVersion: template.effectiveVersion, render, fingerprint, createdAt: now() });
      tx.create(ref(`downstreamJobs/${jobId}`), { jobId, eventId, effect: "notification", state: "pending", attempts: 0, lease: null });
      return { jobId };
    });
  }
  async function current(jobId) {
    return db.runTransaction(async tx => {
      const binding = (await tx.get(ref(`notificationBindings/${identifier(jobId)}`))).data();
      if (!binding) return null;
      const owner = (await tx.get(ref(`accounts/${binding.accountId}`))).data();
      const principal = owner?.principalUid ? (await tx.get(ref(`accountBindings/${owner.principalUid}`))).data() : null;
      const preferences = (await tx.get(ref(`accountPreferences/${binding.accountId}`))).data();
      const event = (await tx.get(ref(`ownerEvents/${binding.eventId}`))).data();
      if (!owner || !["ACTIVE", "RESTORED"].includes(owner.lifecycle) || owner.canonicalAccountId || !principal?.active || principal.accountId !== owner.accountId || principal.epoch !== owner.epoch) return null;
      if (["couturierAlerts", "styleCircle"].includes(binding.category) && preferences?.[binding.category] !== true) return null;
      if (!event || typeof sourceApplicable !== "function" || !await sourceApplicable(tx, event, owner.accountId, binding.category)) return null;
      return { binding, uid: owner.principalUid, epoch: owner.epoch, loginKey: owner.loginKey };
    });
  }
  const handler = {
    reconcile: async ({ jobId }) => {
      const evidence = (await ref(`notificationDelivery/${jobId}`).get()).data();
      if (evidence?.state === "applied") return "applied";
      if (!provider?.reconcile) return "unknown";
      // Absence of a local acknowledgement is not proof nothing was sent.
      const outcome = await provider.reconcile(jobId);
      return ["applied", "not-applied"].includes(outcome) ? outcome : "unknown";
    },
    eligible: async ({ jobId }) => Boolean(await current(jobId)),
    apply: async ({ jobId }) => {
      if (!provider?.send) return "unknown";
      const candidate = await current(jobId); if (!candidate) return "suppressed";
      const destination = await auth.getUser(candidate.uid);
      if (!destination.email || destination.disabled || emailKey(destination.email, secret) !== candidate.loginKey) return "suppressed";
      // Re-resolve after provider lookup, immediately at the send boundary.
      const latest = await current(jobId);
      if (!latest || latest.uid !== candidate.uid || latest.epoch !== candidate.epoch || latest.loginKey !== candidate.loginKey) return "suppressed";
      const result = await provider.send({ idempotencyKey: jobId, destination: destination.email, ...latest.binding.render });
      if (result?.state !== "applied") return "unknown";
      await db.runTransaction(async tx => {
        const path = ref(`notificationDelivery/${jobId}`), prior = await tx.get(path);
        if (!prior.exists) tx.create(path, { jobId, state: "applied", templateId: latest.binding.templateId, templateVersion: latest.binding.templateVersion, observedAt: now(), executor: "system:notification-worker" });
      });
      return "applied";
    },
  };
  return { bind, handler, current };
}
