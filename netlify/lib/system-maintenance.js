import { createDownstreamWorker } from "./downstream-worker.js";
import { createOwnerProjections } from "./owner-projections.js";
import { createConfigurationService } from './shared-configuration.js';
import { createCommunicationService } from './communication-service.js';
import { nativeCommunicationPolicies } from './communication-sources.js';

export function createSystemMaintenance(account, options = {}) {
  const projections = createOwnerProjections(account);
  const communication = createCommunicationService(account,createConfigurationService(account),{...options,sourcePolicies:nativeCommunicationPolicies(account)});
  const qualificationHandler={reconcile:async()=> 'not-applied',eligible:async()=>true,apply:async({event,policy})=>{
    const plan=await communication.qualify(event.eventId,'native-transaction');
    for(const intentId of plan.intentIds){const routes=await communication.route(intentId);for(const branch of routes.branches){if(branch.outcome!=='ROUTED')continue;const bound=await communication.bind(branch.branchId);if(bound.jobId)await communication.worker.run(bound.jobId,policy);}}
    return'applied';
  }};
  const contentHandler={reconcile:async()=> 'not-applied',eligible:async()=>true,apply:async({event,policy})=>{
    const rows=await account.db.collection('notificationBindings').where('templateId','==',event.target).where('state','==','NO RENDER').get();
    for(const row of rows.docs){const bound=await communication.bind(row.id);if(bound.jobId)await communication.worker.run(bound.jobId,policy);}
    return'applied';
  }};
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
  const worker = createDownstreamWorker(account, { "product-projection": productHandler, "lifecycle-projection": lifecycleHandler, 'communication-qualification':qualificationHandler, 'communication-content-recheck':contentHandler });
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
  async function processJob(jobId,policy) {
    const job=(await account.ref(`downstreamJobs/${jobId}`).get()).data();
    if(!job)return{state:'unavailable'};
    return job.effect==='communication'?communication.worker.run(jobId,policy):worker.run(jobId,policy);
  }
  return { processEvent, processJob, worker, projections, communication };
}
