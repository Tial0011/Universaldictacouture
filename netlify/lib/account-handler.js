import { AccountError } from "./account-contract.js";
import { createAccountService } from "./account-service.js";
import { createIdentityResolution } from "./identity-resolution.js";
import { createAccountProofs } from "./account-proofs.js";
import { createAccountSessions } from "./account-sessions.js";
import { createPretransactionService } from "./pretransaction-service.js";
import { createMediaService } from "./media-service.js";

const readActions = new Set(["context", "registration-result", "profile", "addresses", "preferences", "my-information", "operation", "catalogue", "public-media", "media-deliver", "staff-media-deliver", "saves", "save-state", "custom-style", "staff-custom-style", "cluster-operation"]);
const publicReads = new Set(["catalogue", "public-media"]);
const proofActions = new Set(["proof-inspect", "proof-consume", "proof-reconcile"]);
const publicActions = new Set(["register", "recovery-request"]);
export function createAccountHandler(runtime, options = {}) {
  let cluster;
  const service = createAccountService({ ...runtime, guestIntentOwner: (tx, owner, intent) => cluster.importGuest(tx, owner, intent) }), identity = createIdentityResolution(service), proofs = createAccountProofs(service, { origin: runtime.origin, ...options });
  let media;
  cluster = createPretransactionService(service, { ...options, prepareProductMedia: (...args) => media.prepareProductReferences(...args) });
  media = createMediaService(service, cluster, options);
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
      if (readActions.has(action) ? request.method !== "GET" : request.method !== "POST") return json({ error: "method-not-allowed" }, 405);
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
      if (!publicActions.has(action) && !publicReads.has(action) && !proofActions.has(action) && !["operation", "cluster-operation"].includes(action)) {
        const kind = action.startsWith("staff-") || action === "identity-resolve" ? "staff" : "customer";
        claims = await sessions.validate(request, claims, kind);
      }
      let result;
      if (action === "catalogue") result = await cluster.catalogue(url.searchParams.get("productId"));
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
      // No raw provider/Firestore diagnostics, credentials, private form values or
      // tokens reach logs or responses. Public denial never exposes identity existence.
      if (publicActions.has(action) && error.status !== 400 && error.status !== 503) return json({ state: "accepted" });
      return json({ error: error instanceof AccountError ? error.code : "source-unavailable" }, error instanceof AccountError ? error.status : 503);
    }
  };
}
