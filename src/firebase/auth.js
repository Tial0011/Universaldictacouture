import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  getIdToken,
  reload,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import app, { isFirebaseConfigured } from "./config";
import { clearAuthContinuations } from "../services/authFlow";
import { requireCustomerAccountAuthority } from "../services/customerAccountAuthority";
import { currentReadDeadline, protectedWriteDeadline } from "../services/operationalRuntime";

export const auth = isFirebaseConfigured ? getAuth(app) : null;

let authenticationInProgress = false;
let transitionGeneration = 0;
let pendingSignIn = null;

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
      principalUid: auth?.currentUser?.uid || null,
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
    return Boolean(value?.expiresAt && (!value.principalUid || value.principalUid === auth?.currentUser?.uid) && Number(value.expiresAt) <= Date.now());
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

export function signIn(email, password, { keepSignedIn = false } = {}) {
  if (pendingSignIn) return Promise.reject(Object.assign(new Error("Authentication is already pending."), { code: "auth/operation-pending" }));
  const generation = ++transitionGeneration;
  authenticationInProgress = true;
  pendingSignIn = (async () => { try {
    const instance = await applyPersistence();
    const operation = signInWithEmailAndPassword(instance, email, password);
    operation.then(credential => {
      if (generation !== transitionGeneration && instance.currentUser?.uid === credential.user.uid) void signOut(instance).catch(() => {});
    }, () => {});
    const credential = await protectedWriteDeadline(operation);
    if (generation !== transitionGeneration) {
      if (instance.currentUser?.uid === credential.user.uid) await signOut(instance);
      throw Object.assign(new Error("Authentication transition changed."), { code: "auth/principal-changed" });
    }
    storeSessionPolicy(keepSignedIn);
    return credential;
  } finally { authenticationInProgress = false; pendingSignIn = null; } })();
  return pendingSignIn;
}

export async function signUp(email, password, { keepSignedIn = false } = {}) {
  requireCustomerAccountAuthority();
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
  requireCustomerAccountAuthority();
  return updateProfile(user, { displayName });
}

export function changePendingEmail(user, email, actionCodeSettings) {
  requireCustomerAccountAuthority();
  if (!user) throw new Error("Please sign in again before changing your email.");
  return verifyBeforeUpdateEmail(user, email, actionCodeSettings);
}

export async function expireSession() {
  return signOut(requireAuth());
}

export async function signOutUser() {
  transitionGeneration++;
  clearAuthContinuations();
  try { sessionStorage.setItem("udc:auth:intentional-signout", String(Date.now())); } catch { /* optional */ }
  try {
    const result = await signOut(requireAuth());
    clearSessionPolicy();
    // A revoked provider may already be null, so Firebase emits no second
    // observer event. Publish explicit, confirmed local sign-out UX anyway.
    if (typeof window !== "undefined" && !auth.currentUser) window.dispatchEvent(new Event("udc:auth:signed-out"));
    return result;
  } catch (error) {
    try { sessionStorage.removeItem("udc:auth:intentional-signout"); } catch { /* optional */ }
    throw error;
  }
}

export async function revalidateFirebasePrincipal(user = auth?.currentUser) {
  if (!user) return null;
  if (pendingSignIn) { try { await currentReadDeadline(pendingSignIn); } catch { /* current provider state is reconciled below */ } }
  const uid = user.uid;
  await currentReadDeadline(reload(user));
  await currentReadDeadline(getIdToken(user, true));
  if (auth.currentUser?.uid !== uid) throw Object.assign(new Error("Principal changed."), { code: "auth/principal-changed" });
  return auth.currentUser;
}
