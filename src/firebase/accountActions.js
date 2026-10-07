import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "./auth";
import { safeReturnPath } from "../services/authFlow";
import { requireCustomerAccountAuthority } from "../services/customerAccountAuthority";
import { currentReadDeadline, protectedWriteDeadline } from "../services/operationalRuntime";

const proofOperations = new Map();
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
  const instance = requireAccountAuth();
  try {
    await protectedWriteDeadline(sendPasswordResetEmail(instance, email.trim(), actionCodeSettings(returnTo)));
  } catch (error) {
    if (!["auth/user-not-found", "auth/user-disabled", "auth/too-many-requests", "auth/quota-exceeded"].includes(error.code)) throw error;
  }
}

export async function sendAccountVerification(user, returnTo = "/profile") {
  requireCustomerAccountAuthority();
  if (!auth || !user) throw new Error("Please sign in to verify your email.");
  await sendEmailVerification(user, actionCodeSettings(returnTo));
}

export async function refreshAccountVerification(user) {
  if (!auth || !user) throw new Error("Please sign in to verify your email.");
  await reload(user);
  return user.emailVerified;
}

export async function applyEmailVerificationCode(code) {
  if (!code) throw new Error("This verification link is incomplete.");
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
  const result = await currentReadDeadline(checkActionCode(requireAccountAuth(), code));
  if (result.operation !== "VERIFY_EMAIL") throw proofError("auth/wrong-purpose");
  // Comparing a proof's control channel is not durable identity resolution.
  // Definitive durable binding/lifecycle remains the closed owner boundary.
  if (auth.currentUser && auth.currentUser.email !== result.data.email) throw proofError("auth/wrong-account");
  return { operation: result.operation, state: "valid" };
}

export function inspectPasswordResetCode(code) {
  if (!code) throw new Error("This reset link is incomplete.");
  return verifyPasswordResetCode(requireAccountAuth(), code);
}

export async function setPasswordFromResetCode(code, password) {
  if (!code) throw new Error("This reset link is incomplete.");
  requireCustomerAccountAuthority();
  if (proofOperations.has(code)) throw proofError("auth/outcome-unknown");
  proofOperations.set(code, { state: "pending" });
  try { await protectedWriteDeadline(confirmPasswordReset(requireAccountAuth(), code, password)); proofOperations.set(code, { state: "confirmed" }); }
  catch (error) { proofOperations.set(code, { state: "unknown" }); throw error; }
}
