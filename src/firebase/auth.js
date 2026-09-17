import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import app from "./config";

export const auth = getAuth(app);

/**
 * Subscribe to auth state changes.
 * @param {(user: import("firebase/auth").User | null) => void} callback
 * @returns {() => void} unsubscribe function
 */
export function subscribeToAuthChanges(callback) {
  return onAuthStateChanged(auth, callback);
}

export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signUp(email, password, displayName) {
  return createUserWithEmailAndPassword(auth, email, password).then(
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
  return signOut(auth);
}
