import { getAuth } from "firebase/auth";
import app, { isFirebaseConfigured } from "../firebase/config";
const reads = new Set(["context", "registration-result", "profile", "addresses", "preferences", "my-information", "operation", "catalogue", "saves", "save-state", "custom-style", "staff-custom-style", "cluster-operation"]);
const marker = (uid, kind) => `udc:managed-session:${uid}:${kind}`;
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
    const established = await accountRequest("session-start", { kind, keepSignedIn, label: "Current browser" });
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
  for (const kind of ["customer", "staff"]) {
    let established = false; try { established = sessionStorage.getItem(marker(user.uid, kind)) === "1"; } catch { /* optional */ }
    if (!established) continue;
    window.dispatchEvent(new Event("udc:account:authority-uncertain"));
    await accountRequest("session-end", { kind }, { optionalAuth: true, principalUid: user.uid });
    try { sessionStorage.removeItem(marker(user.uid, kind)); sessionStorage.removeItem(marker(user.uid, kind) + ":ref"); } catch { /* optional */ }
  }
}
