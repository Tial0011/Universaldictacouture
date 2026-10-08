import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  reload,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "./auth";
import { safeReturnPath } from "../services/authFlow";
import { requireCustomerAccountAuthority } from "../services/customerAccountAuthority";
import { currentReadDeadline, protectedWriteDeadline } from "../services/operationalRuntime";
import { accountRequest } from "../services/accountApi";

const proofOperations = new Map();
let proofGeneration = 0;
if (typeof window !== "undefined") window.addEventListener("udc:auth:signed-out", () => { proofGeneration++; proofOperations.clear(); });
export function proofOutcome(code) { return proofOperations.get(code)?.state || "not-started"; }
function proofError(code) { return Object.assign(new Error("Current proof outcome is not confirmed."), { code }); }

function requireAccountAuth() {
  if (!auth) throw new Error("Account access is temporarily unavailable.");
  return auth;
}

export function actionContinueUrl(returnTo = "/profile") {
  if (typeof window === "undefined") return undefined;
  const target = new URL("/signin", window.location.origin);
  target.searchParams.set("returnTo", safeReturnPath(returnTo, "/profile"));
  return target.toString();
}

export function actionCodeSettings(returnTo = "/profile") {
  return { url: actionContinueUrl(returnTo) };
}

export async function requestPasswordReset(email, returnTo = "/profile") {
  requireAccountAuth();
  return accountRequest("recovery-request", { email: email.trim(), returnTo: safeReturnPath(returnTo, "/profile"), operationId: crypto.randomUUID() }, { publicRequest: true });
}

export async function sendAccountVerification(user, returnTo = "/profile") {
  if (!auth || !user) throw new Error("Please sign in to verify your email.");
  return accountRequest("verification-request", { returnTo: safeReturnPath(returnTo, "/profile") }, { principalUid: user.uid });
}

export async function refreshAccountVerification(user) {
  if (!auth || !user) throw new Error("Please sign in to verify your email.");
  await reload(user);
  return user.emailVerified;
}

export async function applyEmailVerificationCode(code) {
  if (!code) throw new Error("This verification link is incomplete.");
  if (code.startsWith("udc_")) return consumeTrustedProof(code, "verify");
  await inspectEmailVerificationCode(code);
  requireCustomerAccountAuthority();
  if (proofOperations.has(code)) throw proofError("auth/outcome-unknown");
  proofOperations.set(code, { state: "pending" });
  try { await protectedWriteDeadline(applyActionCode(requireAccountAuth(), code)); proofOperations.set(code, { state: "confirmed" }); }
  catch (error) { proofOperations.set(code, { state: "unknown" }); throw error; }
  if (auth.currentUser) await reload(auth.currentUser);
}

export async function inspectEmailVerificationCode(code) {
  if (typeof code !== "string" || !code || code.length > 2048) throw proofError("auth/invalid-action-code");
  if (code.startsWith("udc_")) {
    const result = await accountRequest("proof-inspect", { token: code, purpose: "verify" }, { optionalAuth: true });
    if (result.state !== "valid") throw proofError("auth/proof-" + result.state);
    return { operation: "VERIFY_EMAIL", state: "valid" };
  }
  const result = await currentReadDeadline(checkActionCode(requireAccountAuth(), code));
  if (result.operation !== "VERIFY_EMAIL") throw proofError("auth/wrong-purpose");
  // Comparing a proof's control channel is not durable identity resolution.
  // Definitive durable binding/lifecycle remains the closed owner boundary.
  if (auth.currentUser && auth.currentUser.email !== result.data.email) throw proofError("auth/wrong-account");
  return { operation: result.operation, state: "valid" };
}

export async function inspectPasswordResetCode(code) {
  if (!code) throw new Error("This reset link is incomplete.");
  if (code.startsWith("udc_")) {
    const result = await accountRequest("proof-inspect", { token: code, purpose: "reset" }, { optionalAuth: true });
    if (result.state !== "valid") throw proofError("auth/proof-" + result.state);
    return "";
  }
  return verifyPasswordResetCode(requireAccountAuth(), code);
}

export async function setPasswordFromResetCode(code, password) {
  if (!code) throw new Error("This reset link is incomplete.");
  if (code.startsWith("udc_")) return consumeTrustedProof(code, "reset", password);
  requireCustomerAccountAuthority();
  if (proofOperations.has(code)) throw proofError("auth/outcome-unknown");
  proofOperations.set(code, { state: "pending" });
  try { await protectedWriteDeadline(confirmPasswordReset(requireAccountAuth(), code, password)); proofOperations.set(code, { state: "confirmed" }); }
  catch (error) { proofOperations.set(code, { state: "unknown" }); throw error; }
}
async function consumeTrustedProof(token, purpose, password) {
  if (proofOperations.has(token)) throw proofError(proofOperations.get(token).state === "confirmed" ? "auth/proof-consumed" : "auth/outcome-unknown");
  const operationId = crypto.randomUUID(), principalUid = auth.currentUser?.uid || null, generation = proofGeneration;
  proofOperations.set(token, { state: "pending", operationId, purpose, principalUid });
  try {
    const result = await accountRequest("proof-consume", { token, purpose, operationId, ...(purpose === "reset" ? { password } : {}) }, { optionalAuth: true });
    if (result.state !== "committed") throw proofError("auth/outcome-unknown");
    if (generation !== proofGeneration || (auth.currentUser?.uid || null) !== principalUid) throw proofError("auth/principal-changed");
    proofOperations.set(token, { state: "confirmed", operationId, purpose, principalUid });
    const current = auth.currentUser;
    if (purpose === "verify" && current) { try { await reload(current); if (auth.currentUser?.uid === current.uid) await current.getIdToken(true); } catch { /* known proof commit does not become unknown because metadata refresh failed */ } }
  } catch (error) {
    if (generation === proofGeneration && (auth.currentUser?.uid || null) === principalUid && proofOperations.get(token)?.state !== "confirmed") proofOperations.set(token, { state: "unknown", operationId, purpose, principalUid });
    throw error;
  }
}
export async function reconcileTrustedProof(token, password) {
  const pending = proofOperations.get(token); if (!pending || pending.state !== "unknown" || pending.principalUid !== (auth.currentUser?.uid || null)) throw proofError("auth/outcome-unknown");
  const result = await accountRequest("proof-reconcile", { token, purpose: pending.purpose, operationId: pending.operationId, ...(pending.purpose === "reset" ? { password } : {}) }, { optionalAuth: true });
  if (result.state === "committed") proofOperations.set(token, { ...pending, state: "confirmed" });
  return result;
}
