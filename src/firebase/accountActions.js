import {
  applyActionCode,
  confirmPasswordReset,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "./auth";
import { safeReturnPath } from "../services/authFlow";

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
    await sendPasswordResetEmail(instance, email.trim(), actionCodeSettings(returnTo));
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
  }
}

export async function sendAccountVerification(user, returnTo = "/profile") {
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
  await applyActionCode(requireAccountAuth(), code);
  if (auth.currentUser) await reload(auth.currentUser);
}

export function inspectPasswordResetCode(code) {
  if (!code) throw new Error("This reset link is incomplete.");
  return verifyPasswordResetCode(requireAccountAuth(), code);
}

export function setPasswordFromResetCode(code, password) {
  if (!code) throw new Error("This reset link is incomplete.");
  return confirmPasswordReset(requireAccountAuth(), code, password);
}
