import { AccountError } from "./account-contract.js";
import { createAccountService } from "./account-service.js";
import { createIdentityResolution } from "./identity-resolution.js";
import { createAccountProofs } from "./account-proofs.js";
import { createAccountSessions } from "./account-sessions.js";
import { createPretransactionService } from "./pretransaction-service.js";
import { createMediaService } from "./media-service.js";
import { createTransactionService } from "./transaction-service.js";
import { createConversationReviewService } from "./transaction-conversation-review.js";
import { createConfigurationService } from "./shared-configuration.js";
import { createOwnerProjections } from "./owner-projections.js";
import { createRuntimeIntegrity, safeObservation } from "./runtime-integrity.js";
import { createCommunicationService } from './communication-service.js';
import { nativeCommunicationPolicies } from './communication-sources.js';
import { createCommunicationTestSend } from './communication-test-send.js';
import { createOrderWorkspace } from './order-workspace.js';
import { createOrderGovernance } from './order-governance.js';

const readActions = new Set(["context", "registration-result", "profile", "addresses", "preferences", "my-information", "operation", "catalogue", "public-media", "media-deliver", "staff-media-deliver", "saves", "save-state", "custom-style", "staff-custom-style", "cluster-operation"]);
const transactionReads = new Set(["orders", "order", "staff-order", "edition", "staff-edition", "payment", "staff-payment", "transaction-operation", "messages", "staff-messages", "review-feed"]);
const systemReads = new Set(["staff-configuration", "configuration-operation", "staff-audit", "public-search", "staff-order-search", "media-operation", "staff-media-operation"]);
for (const action of ['notifications','staff-notifications','notification-operation','staff-notification-operation','notification-open','staff-notification-open','staff-delivery-issues','staff-template-library']) systemReads.add(action);
systemReads.add('staff-template-test-result');
systemReads.add('staff-template-history');
systemReads.add('staff-delivery-issue');
for (const action of ['staff-order-workspace','staff-order-queue','staff-order-original','staff-order-payments','staff-order-extensions','staff-order-activity']) systemReads.add(action);
for (const action of ['staff-order-notes','staff-order-note-history','staff-order-escalations']) systemReads.add(action);
systemReads.add('staff-order-summary');
const publicReads = new Set(["catalogue", "public-media", "review-feed", "public-search"]);
const proofActions = new Set(["proof-inspect", "proof-consume", "proof-reconcile"]);
const publicActions = new Set(["register", "recovery-request"]);
export function createAccountHandler(runtime, options = {}) {
  let cluster;
  const service = createAccountService({ ...runtime, guestIntentOwner: (tx, owner, intent) => cluster.importGuest(tx, owner, intent) }), identity = createIdentityResolution(service), proofs = createAccountProofs(service, { origin: runtime.origin, ...options });
  const transactions = createTransactionService(service), communication = createConversationReviewService(transactions);
  const orderWorkspace = createOrderWorkspace(transactions);
  const orderGovernance = createOrderGovernance(transactions);
  const configuration = createConfigurationService(service), projections = createOwnerProjections(service), integrity = createRuntimeIntegrity(service);
  const notifications=createCommunicationService(service,configuration,{...options,origin:runtime.origin,sourcePolicies:nativeCommunicationPolicies(service)});
  const templateTests=createCommunicationTestSend(service,configuration,{provider:options.testEmailProvider,origin:runtime.origin});
  let media;
  cluster = createPretransactionService(service, { ...options, mainOrderOwner: options.mainOrderOwner || transactions.mainOrderOwner, prepareProductMedia: (...args) => media.prepareProductReferences(...args) });
  media = createMediaService(service, cluster, { ...options, ownerContext: async (...args) => await transactions.mediaContext(...args) || await communication.mediaContext(...args), publicContext: communication.publicMedia });
  const sessions = createAccountSessions(service, { origin: runtime.origin });
  const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
  async function limitedBody(request, maxBytes = 65536) {
    if (Number(request.headers.get("content-length")) > maxBytes) throw new AccountError("invalid-argument", 413);
    if (!request.body) return "{}";
    const reader = request.body.getReader(), chunks = []; let size = 0;
    while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.length; if (size > maxBytes) { await reader.cancel(); throw new AccountError("invalid-argument", 413); }
      chunks.push(Buffer.from(item.value));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  async function rateAllowed(ip, action) {
    if (typeof ip !== "string" || !ip) throw new AccountError("source-unavailable", 503);
    const key = service.keyed(ip + ":" + action + ":" + Math.floor(service.now() / 60000));
    return runtime.db.runTransaction(async tx => {
      const ref = runtime.db.doc(`accountRateLimits/${key}`), prior = await tx.get(ref), count = prior.data()?.count || 0;
      if (count >= 10) return false;
      tx.set(ref, { count: count + 1, expiresAt: service.now() + 120000 }); return true;
    });
  }
  return async (request, context = {}) => {
    const started = Date.now(), url = new URL(request.url), action = url.searchParams.get("action") || "";
    try {
      if (request.headers.get("origin") && request.headers.get("origin") !== runtime.origin) throw new AccountError("permission-denied");
      if (readActions.has(action) || transactionReads.has(action) || systemReads.has(action) ? request.method !== "GET" : request.method !== "POST") return json({ error: "method-not-allowed" }, 405);
      const maxBytes = action.endsWith("media-stage") ? 6 * 1024 * 1024 : 65536;
      const bodyText = request.method === "POST" ? await limitedBody(request, maxBytes) : "{}";
      let input; try { input = JSON.parse(bodyText); } catch { return json({ error: "invalid-argument" }, 400); }
      const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
      let claims = null;
      if (token) { try { const verified = await runtime.auth.verifyIdToken(token, action !== "operation" && action !== "session-end"); claims = { uid: verified.uid, auth_time: verified.auth_time }; } catch { throw new AccountError("session-revoked", 401); } }
      if (!publicActions.has(action) && !publicReads.has(action) && !proofActions.has(action) && !claims) throw new AccountError("unauthenticated", 401);
      if (["session-start", "session-end"].includes(action)) {
        const result = action === "session-start" ? await sessions.start(request, claims, input) : await sessions.end(request, claims, input);
        const response = json(result.value); response.headers.set("Set-Cookie", result.cookie); return response;
      }
      if (!publicActions.has(action) && !publicReads.has(action) && !proofActions.has(action) && !["operation", "cluster-operation", "transaction-operation", "configuration-operation"].includes(action)) {
        const kind = action.startsWith("staff-") || action === "identity-resolve" ? "staff" : "customer";
        claims = await sessions.validate(request, claims, kind);
      }
      let result;
      if (action === 'staff-order-notes') result = await orderGovernance.noteList(claims,url.searchParams.get('orderId'),url.searchParams.get('componentId') || 'base');
      else if (action === 'staff-order-note-history') result = await orderGovernance.noteHistory(claims,url.searchParams.get('orderId'),url.searchParams.get('noteId'));
      else if (action === 'staff-order-note-change') result = await orderGovernance.noteChange(claims,input);
      else if (action === 'staff-order-escalations') result = await orderGovernance.escalationList(claims,url.searchParams.get('orderId'),url.searchParams.get('componentId') || 'base');
      else if (action === 'staff-order-escalation-change') result = await orderGovernance.escalationChange(claims,input);
      else if (action === 'staff-order-summary') result = await orderWorkspace.summary(claims,url.searchParams.get('orderId'));
      else if (action === 'staff-order-workspace') result = await orderWorkspace.read(claims,url.searchParams.get('orderId'),url.searchParams.get('componentId') || 'base');
      else if (action === 'staff-order-queue') result = await orderWorkspace.queue(claims,url.searchParams.get('term') || '');
      else if (action === 'staff-order-original') result = await orderWorkspace.original(claims,url.searchParams.get('orderId'));
      else if (action === 'staff-order-payments') result = await orderWorkspace.payments(claims,url.searchParams.get('orderId'),url.searchParams.get('componentId') || 'base',url.searchParams.get('before'));
      else if (action === 'staff-order-extensions') result = await orderWorkspace.extensions(claims,url.searchParams.get('orderId'));
      else if (action === 'staff-order-activity') result = await orderWorkspace.activity(claims,url.searchParams.get('orderId'),url.searchParams.get('componentId') || 'base',url.searchParams.get('after'));
      else if (['notifications','staff-notifications'].includes(action)) result=await notifications.list(claims,action.startsWith('staff-')?'staff':'customer',{filter:url.searchParams.get('filter')||'all',...(url.searchParams.has('before')?{before:url.searchParams.get('before')}:{})});
      else if (['notification-change','staff-notification-change'].includes(action)) result=await notifications.change(claims,action.startsWith('staff-')?'staff':'customer',input);
      else if (['notification-mark-all','staff-notification-mark-all'].includes(action)) result=await notifications.markAll(claims,action.startsWith('staff-')?'staff':'customer',input);
      else if (['notification-operation','staff-notification-operation'].includes(action)) result=await notifications.reconcile(claims,action.startsWith('staff-')?'staff':'customer',url.searchParams.get('operationId'));
      else if (['notification-open','staff-notification-open'].includes(action)) result=await notifications.open(claims,action.startsWith('staff-')?'staff':'customer',url.searchParams.get('notificationId'));
      else if (action==='staff-delivery-issues') result=await notifications.issues(claims);
      else if (action==='staff-delivery-issue') result=await notifications.issueDetail(claims,url.searchParams.get('branchId'));
      else if (action==='staff-template-library') result=await configuration.library(claims);
      else if (action==='staff-template-history') result=await configuration.history(claims,url.searchParams.get('configurationId'),url.searchParams.has('before')?Number(url.searchParams.get('before')):null);
      else if (action==='staff-template-test-send') result=await templateTests.send(claims,input);
      else if (action==='staff-template-test-result') result=await templateTests.read(claims,url.searchParams.get('operationId'));
      else if (action==='staff-delivery-recover') result=await notifications.recover(claims,input);
      else if (action === "staff-configuration") result = await configuration.read(claims, url.searchParams.get("configurationId"));
      else if (action === "staff-configuration-mutate") result = await configuration.mutate(claims, input);
      else if (action === "staff-template-preview") result = await configuration.preview(claims, input);
      else if (action === "configuration-operation") result = await configuration.reconcile(claims, url.searchParams.get("operationId"));
      else if (action === "staff-audit") result = await integrity.auditRead(claims, url.searchParams.get("auditId"));
      else if (action === "public-search") result = await projections.publicSearch(url.searchParams.get("term") || "");
      else if (action === "staff-order-search") result = await projections.staffOrders(claims, url.searchParams.get("term") || "");
      else if (action === "orders") result = await transactions.listOrders(claims);
      else if (action === "catalogue-order") result = await transactions.catalogueOrder(claims,input);
      else if (["order", "staff-order"].includes(action)) result = await transactions.readOrder(claims, url.searchParams.get("orderId"), url.searchParams.get("componentId") || "base");
      else if (["edition", "staff-edition"].includes(action)) result = await transactions.historicalEdition(claims,url.searchParams.get("orderId"),url.searchParams.get("componentId")||"base",Number(url.searchParams.get("number")));
      else if (["commercial", "staff-commercial"].includes(action)) result = await transactions.commercial(claims, input);
      else if (action === "payment-intent") result = await transactions.paymentIntent(claims, input);
      else if (action === "payment-submit") result = await transactions.paymentSubmit(claims, input);
      else if (action === "staff-payment-review") result = await transactions.paymentReview(claims, input);
      else if (["payment", "staff-payment"].includes(action)) result = await transactions.paymentDetail(claims, url.searchParams.get("paymentId"));
      else if (["extension", "staff-extension"].includes(action)) result = await transactions.extension(claims, input);
      else if (["operations", "staff-operations"].includes(action)) result = await transactions.operational(claims, input);
      else if (action === "transaction-operation") result = await transactions.reconcile(claims, url.searchParams.get("operationId"));
      else if (action === "general-chat-start") result = await communication.generalChat(claims, input);
      else if (["messages", "staff-messages"].includes(action)) result = await communication.messages(claims, url.searchParams.get("chatId"), url.searchParams.has("before") ? Number(url.searchParams.get("before")) : null);
      else if (["message-send", "staff-message-send"].includes(action)) result = await communication.send(claims, input);
      else if (action === "review-submit") result = await communication.submitReview(claims, input);
      else if (action === "review-media-attach") result = await communication.attachReviewMedia(claims, input);
      else if (["review-change", "staff-review-change"].includes(action)) result = await communication.changeReview(claims, input);
      else if (action === "review-feed") result = await communication.feed();
      else if (action === "staff-review-product-draft") result = await communication.reviewToDraft(claims, input);
      else if (action === "catalogue") result = await cluster.catalogue(url.searchParams.get("productId"));
      else if (["public-media", "media-deliver", "staff-media-deliver"].includes(action)) {
        const bytes = await media.deliver(claims, url.searchParams.get("referenceId"), { publicOnly: action === "public-media", thumbnail: url.searchParams.get("thumbnail") === "1" });
        return new Response(bytes, { headers: { "Content-Type": "image/webp", "Cache-Control": "no-store, private", "Netlify-CDN-Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      }
      else if (action === "staff-product-mutate") result = await cluster.mutateProduct(claims, input);
      else if (action === "saves") result = await cluster.listSaves(claims, url.searchParams.get("kind"));
      else if (action === "save-state") result = await cluster.saveState(claims, url.searchParams.get("kind"), url.searchParams.get("targetId"));
      else if (action === "save-mutate") result = await cluster.mutateSave(claims, input);
      else if (["custom-style", "staff-custom-style"].includes(action)) result = await cluster.readRequest(claims, url.searchParams.get("requestId"));
      else if (["custom-style-save", "staff-custom-style-save"].includes(action)) result = await cluster.mutateRequest(claims, input);
      else if (["custom-style-handoff", "staff-custom-style-handoff"].includes(action)) result = await cluster.handoff(claims, input);
      else if (action === "cluster-operation") result = await cluster.reconcile(claims, url.searchParams.get("operationId"));
      else if (["media-stage", "staff-media-stage"].includes(action)) result = await media.stage(claims, input);
      else if (["media-operation", "staff-media-operation"].includes(action)) result = await media.reconcileStage(claims, url.searchParams.get("operationId"));
      else if (["media-stage-reconcile", "staff-media-stage-reconcile"].includes(action)) result = await media.completeStage(claims,input);
      else if (["media-attach", "staff-media-attach"].includes(action)) result = await media.attach(claims, input);
      else if (publicActions.has(action)) {
        if (await rateAllowed(context.ip, action)) result = action === "register" ? await service.register(input) : await proofs.queueRecovery(input);
        result ||= { state: "accepted" };
      } else if (action === "context") result = await service.context(claims);
      else if (action === "registration-result") result = await service.registrationResult(claims, url.searchParams.get("operationId"));
      else if (action === "profile") result = await service.readProfile(claims);
      else if (action === "profile-save") result = await service.saveProfile(claims, input);
      else if (action === "addresses") result = await service.addresses(claims);
      else if (action === "address-mutate") result = await service.addressMutation(claims, input);
      else if (action === "preferences") result = await service.readPreferences(claims);
      else if (action === "preferences-save") result = await service.savePreferences(claims, input);
      else if (action === "my-information") result = await service.myInformation(claims);
      else if (action === "revoke-sessions") result = await service.revokeSessions(claims, input);
      else if (action === "staff-customer-information") result = await service.staffCustomerInformation(claims, input);
      else if (action === "staff-deleted-account") result = await service.staffDeletedAccount(claims, input);
      else if (action === "guest-import") result = await service.importGuestIntent(claims, input);
      else if (action === "operation") result = await service.reconcile(claims, url.searchParams.get("operationId"));
      else if (action === "delete-account") result = await service.deletion(claims, input);
      else if (action === "staff-lifecycle") result = await service.lifecycle(claims, input);
      else if (action === "conflict-intake") result = await identity.intake(claims, input);
      else if (action === "identity-resolve") result = await identity.resolve(claims, input);
      else if (action === "verification-request") result = await proofs.issueVerification(claims, input);
      else if (action === "proof-inspect") result = await proofs.inspect(input, claims);
      else if (action === "proof-consume") result = await proofs.consume(input, claims);
      else if (action === "proof-reconcile") result = await proofs.reconcile(input, claims);
      else return json({ error: "not-found" }, 404);
      if (publicActions.has(action)) await new Promise(resolve => setTimeout(resolve, Math.max(0, (options.minimumPublicMs ?? 500) - (Date.now() - started))));
      return json(result);
    } catch (error) {
      try { options.observe?.(safeObservation(error)); } catch { /* diagnostics never replay/rollback owner truth */ }
      // No raw provider/Firestore diagnostics, credentials, private form values or
      // tokens reach logs or responses. Public denial never exposes identity existence.
      if (publicActions.has(action) && error.status !== 400 && error.status !== 503) return json({ state: "accepted" });
      return json({ error: error instanceof AccountError ? error.code : "source-unavailable" }, error instanceof AccountError ? error.status : 503);
    }
  };
}
