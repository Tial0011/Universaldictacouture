import { getAuth } from "firebase/auth";
import app, { isFirebaseConfigured } from "../firebase/config";
const reads = new Set(["context", "registration-result", "profile", "addresses", "preferences", "my-information", "operation", "catalogue", "saves", "save-state", "custom-style", "staff-custom-style", "cluster-operation", "orders", "order", "staff-order", "edition", "staff-edition", "payment", "staff-payment", "transaction-operation", "legacy-chat-history", "couturiers", "conversations", "staff-conversations", "conversation", "staff-conversation", "messages", "staff-messages", "chat-event", "staff-chat-event", "chat-search", "staff-chat-search", "chat-media", "staff-chat-media", "review-feed", "staff-configuration", "configuration-operation", "staff-audit", "public-search", "staff-order-search"]);
const marker = (uid, kind) => `udc:managed-session:${uid}:${kind}`;
// A page can mount several owner hooks at once. They must share one session
// admission; competing Set-Cookie responses must not revoke each other.
const pendingSessions = new Map();
reads.add("media-operation"); reads.add("staff-media-operation");
for(const action of ['notifications','staff-notifications','notification-operation','staff-notification-operation','notification-open','staff-notification-open','staff-delivery-issues','staff-template-library']) reads.add(action);
reads.add('staff-template-test-result');
reads.add('staff-template-history');
reads.add('staff-delivery-issue');
for (const action of ['staff-order-workspace','staff-order-queue','staff-order-original','staff-order-payments','staff-order-extensions','staff-order-activity']) reads.add(action);
for (const action of ['staff-order-notes','staff-order-note-history','staff-order-escalations']) reads.add(action);
reads.add('staff-order-summary');
reads.add('staff-access-list'); reads.add('staff-access-operation');
export async function accountRequest(action, input = {}, { publicRequest = false, optionalAuth = false, principalUid, sessionRetry = false } = {}) {
  if (!isFirebaseConfigured || !app) throw Object.assign(new Error("Current account access is unavailable."), { code: "account-source-unavailable" });
  const auth = getAuth(app), user = auth.currentUser, uid = user?.uid || null;
  if ((!publicRequest && !optionalAuth && !user) || (principalUid && principalUid !== uid)) throw Object.assign(new Error("Current account access changed."), { code: "auth/principal-changed" });
  const token = !publicRequest && user ? await user.getIdToken() : null;
  if (auth.currentUser?.uid !== uid && !(auth.currentUser == null && uid == null)) throw Object.assign(new Error("Current account access changed."), { code: "auth/principal-changed" });
  const url = new URL("/.netlify/functions/account", window.location.origin); url.searchParams.set("action", action);
  const read = reads.has(action);
  if (read) Object.entries(input).forEach(([key, value]) => { if (value != null) url.searchParams.set(key, String(value)); });
  let response;
  try {
    response = await fetch(url, { method: read ? "GET" : "POST", cache: "no-store", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(read ? {} : { "Content-Type": "application/json" }) }, ...(read ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(15000) });
  } catch { throw Object.assign(new Error(read ? "Current information could not be checked." : "The outcome could not be confirmed. Check it before repeating."), { code: read ? "account-source-unavailable" : "auth/outcome-unknown", operationId: input.operationId }); }
  let value;
  try { value = await response.json(); } catch { throw Object.assign(new Error("The outcome could not be checked."), { code: read ? "account-source-unavailable" : "auth/outcome-unknown" }); }
  if ((auth.currentUser?.uid || null) !== uid) throw Object.assign(new Error("Current account access changed."), { code: "auth/principal-changed" });
  if (!response.ok && value.error === "session-required" && !sessionRetry && !publicRequest && !optionalAuth && !action.startsWith("session-")) {
    const kind = action.startsWith("staff-") || action === "identity-resolve" ? "staff" : "customer";
    let keepSignedIn = false;
    try { const policy = JSON.parse(localStorage.getItem("udc:auth:session-policy") || "null"); keepSignedIn = policy?.principalUid === uid && policy.keepSignedIn === true; } catch { /* optional preference */ }
    const key = `${uid}:${kind}`;
    if (!pendingSessions.has(key)) {
      const pending = accountRequest("session-start", { kind, keepSignedIn, label: "Current browser" }, { principalUid: uid });
      pendingSessions.set(key, pending);
      pending.finally(() => { if (pendingSessions.get(key) === pending) pendingSessions.delete(key); }).catch(() => {});
    }
    const established = await pendingSessions.get(key);
    if (auth.currentUser?.uid !== uid) throw Object.assign(new Error("Current account access changed."), { code: "auth/principal-changed" });
    try { sessionStorage.setItem(marker(uid, kind), "1"); } catch { /* non-authoritative marker */ }
    try { sessionStorage.setItem(marker(uid, kind) + ":ref", established.sessionRef); } catch { /* denial/revalidation pointer only */ }
    window.dispatchEvent(new CustomEvent("udc:account:session-established", { detail: { uid, kind, sessionRef: established.sessionRef } }));
    // The first refusal is authoritative no-execution. Retry only the same
    // logical operation; transport/unknown outcomes are never blindly replayed.
    return accountRequest(action, input, { publicRequest, optionalAuth, principalUid: uid, sessionRetry: true });
  }
  if (!response.ok) throw Object.assign(new Error("Current account action is unavailable."), { code: !read && response.status >= 500 && value.error !== "account-source-unavailable" && value.error !== "proof-delivery-unavailable" ? "auth/outcome-unknown" : value.error || "account-source-unavailable", status: response.status, operationId: input.operationId });
  return value;
}
export function resolveCustomerAccount(user) { return accountRequest("context", {}, { principalUid: user?.uid }); }
export function registerCustomerAccount(email, password, operationId) { return accountRequest("register", { email, password, operationId }, { publicRequest: true }); }
export function reconcileCustomerOperation(operationId) { return accountRequest("operation", { operationId }); }
export async function endManagedSessions(user) {
  if (!user) return;
  let confirmed = true;
  for (const kind of ["customer", "staff"]) {
    let established = false; try { established = sessionStorage.getItem(marker(user.uid, kind)) === "1"; } catch { /* optional */ }
    if (!established) continue;
    window.dispatchEvent(new Event("udc:account:authority-uncertain"));
    try { await accountRequest("session-end", { kind }, { optionalAuth: true, principalUid: user.uid }); }
    catch (error) {
      // Local Firebase sign-out must remain possible during a server outage.
      // This makes no claim that other devices or remote sessions were revoked.
      if (!["session-revoked", "session-required", "unauthenticated"].includes(error.code)) confirmed = false;
    }
    try { sessionStorage.removeItem(marker(user.uid, kind)); sessionStorage.removeItem(marker(user.uid, kind) + ":ref"); } catch { /* optional */ }
  }
  return { confirmed };
}
