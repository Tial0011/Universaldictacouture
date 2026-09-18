import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import app, { isFirebaseConfigured } from "./config";

/** The Auth instance, or null while Firebase is unconfigured. */
export const auth = isFirebaseConfigured ? getAuth(app) : null;

function requireAuth() {
  if (!auth) {
    throw new Error(
      "Firebase is not configured. Set the VITE_FIREBASE_* environment variables."
    );
  }
  return auth;
}

/**
 * Subscribe to auth state changes.
 *
 * Without Firebase configuration there is no session to observe, so
 * the caller is told once that nobody is signed in and given a no-op
 * unsubscribe. Auth state therefore resolves normally and the app
 * finishes loading instead of hanging or throwing.
 *
 * @param {(user: import("firebase/auth").User | null) => void} callback
 * @returns {() => void} unsubscribe function
 */
export function subscribeToAuthChanges(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export function signIn(email, password) {
  return signInWithEmailAndPassword(requireAuth(), email, password);
}

export function signUp(email, password, displayName) {
  return createUserWithEmailAndPassword(requireAuth(), email, password).then(
    (credential) => {
      if (displayName) {
        return updateProfile(credential.user, { displayName }).then(
          () => credential
        );
      }
      return credential;
    }
  );
}

export function signOutUser() {
  return signOut(requireAuth());
}
