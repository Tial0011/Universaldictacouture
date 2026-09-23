import { reload, sendEmailVerification, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "./auth";

export async function requestPasswordReset(email) {
  if (!auth) throw new Error("Account access is temporarily unavailable.");

  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error) {
    // Keep the result neutral so this form does not reveal registered addresses.
    if (error.code !== "auth/user-not-found") throw error;
  }
}

export async function sendAccountVerification(user) {
  if (!auth || !user) throw new Error("Please sign in to verify your email.");
  await sendEmailVerification(user);
}

export async function refreshAccountVerification(user) {
  if (!auth || !user) throw new Error("Please sign in to verify your email.");
  await reload(user);
  return user.emailVerified;
}
