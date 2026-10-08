import { createDownstreamWorker } from "./downstream-worker.js";
import { createOwnerProjections } from "./owner-projections.js";

export function createSystemMaintenance(account) {
  const projections = createOwnerProjections(account);
  const productHandler = {
    reconcile: async () => "not-applied", // current owner rebuild is idempotent, not an external send
    eligible: async () => true,
    apply: async ({ event }) => { await projections.rebuildProduct(event.target); return "applied"; },
  };
  const lifecycleHandler = {
    reconcile: async () => "not-applied",
    eligible: async () => true,
    apply: async ({ event }) => { await account.reconcileLifecycle(event.operationId); return "applied"; },
  };
  const worker = createDownstreamWorker(account, { "product-projection": productHandler, "lifecycle-projection": lifecycleHandler });
  async function processEvent(eventId, policy) {
    const event = (await account.ref(`ownerEvents/${eventId}`).get()).data();
    if (!event) return { state: "unavailable" };
    const jobs = [];
    for (const effect of event.effects) {
      const { jobId } = await worker.materialize(eventId, effect);
      jobs.push({ effect, ...await worker.run(jobId, policy) });
    }
    return { eventId, jobs };
  }
  return { processEvent, worker, projections };
}
