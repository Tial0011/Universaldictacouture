import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import app, { isFirebaseConfigured } from "./config";

export const auth = isFirebaseConfigured ? getAuth(app) : null;

let authenticationInProgress = false;

const SESSION_POLICY_KEY = "udc:auth:session-policy";
const DEFAULT_STANDARD_HOURS = 24;
const DEFAULT_EXTENDED_DAYS = 30;

function requireAuth() {
  if (!auth) throw new Error("Firebase is not configured. Set the VITE_FIREBASE_* environment variables.");
  return auth;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function sessionDurationMs(keepSignedIn) {
  const standardHours = positiveNumber(import.meta.env.VITE_AUTH_STANDARD_SESSION_HOURS, DEFAULT_STANDARD_HOURS);
  const extendedDays = positiveNumber(import.meta.env.VITE_AUTH_EXTENDED_SESSION_DAYS, DEFAULT_EXTENDED_DAYS);
  return keepSignedIn ? extendedDays * 24 * 60 * 60 * 1000 : standardHours * 60 * 60 * 1000;
}

function storeSessionPolicy(keepSignedIn) {
  try {
    localStorage.setItem(SESSION_POLICY_KEY, JSON.stringify({
      keepSignedIn: Boolean(keepSignedIn),
      expiresAt: Date.now() + sessionDurationMs(keepSignedIn),
    }));
  } catch {
    // Firebase still protects the account if browser storage is unavailable.
  }
}

export function clearSessionPolicy() {
  try { localStorage.removeItem(SESSION_POLICY_KEY); } catch { /* optional */ }
}

export function sessionPolicyExpired() {
  if (authenticationInProgress) return false;
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_POLICY_KEY) || "null");
    return Boolean(value?.expiresAt && Number(value.expiresAt) <= Date.now());
  } catch {
    return false;
  }
}

async function applyPersistence() {
  const instance = requireAuth();
  // Both ordinary and extended sessions survive a tab/browser close. The
  // app-level policy below controls their configurable lifetime instead.
  await setPersistence(instance, browserLocalPersistence);
  return instance;
}

export function subscribeToAuthChanges(callback) {
  if (!auth) { callback(null); return () => {}; }
  return onAuthStateChanged(auth, callback);
}

export async function signIn(email, password, { keepSignedIn = false } = {}) {
  authenticationInProgress = true;
  try {
    const instance = await applyPersistence();
    const credential = await signInWithEmailAndPassword(instance, email, password);
    storeSessionPolicy(keepSignedIn);
    return credential;
  } finally { authenticationInProgress = false; }
}

export async function signUp(email, password, { keepSignedIn = false } = {}) {
  authenticationInProgress = true;
  try {
    const instance = await applyPersistence();
    const credential = await createUserWithEmailAndPassword(instance, email, password);
    storeSessionPolicy(keepSignedIn);
    return credential;
  } finally { authenticationInProgress = false; }
}

// Profile setup can be retried without creating a second account.
export function updateAccountName(user, displayName) {
  return updateProfile(user, { displayName });
}

export function changePendingEmail(user, email, actionCodeSettings) {
  if (!user) throw new Error("Please sign in again before changing your email.");
  return verifyBeforeUpdateEmail(user, email, actionCodeSettings);
}

export async function expireSession() {
  return signOut(requireAuth());
}

export async function signOutUser() {
  try { sessionStorage.setItem("udc:auth:intentional-signout", String(Date.now())); } catch { /* optional */ }
  try {
    const result = await signOut(requireAuth());
    clearSessionPolicy();
    return result;
  } catch (error) {
    try { sessionStorage.removeItem("udc:auth:intentional-signout"); } catch { /* optional */ }
    throw error;
  }
}
