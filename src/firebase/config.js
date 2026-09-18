import { initializeApp, getApps, getApp } from "firebase/app";

// All values are supplied via environment variables — see .env.example.
// Never hardcode Firebase credentials in source.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * True only when the client build actually received Firebase values.
 * Services use this to return a truthful "catalogue unavailable" state
 * instead of throwing raw SDK errors at visitors.
 */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

/**
 * The Firebase app, or null when no configuration was supplied.
 *
 * Firebase is only initialized when real values are present. Calling
 * initializeApp with undefined values succeeds but leaves an app whose
 * services throw on first use (auth/invalid-api-key), which took the
 * whole frontend down before any configuration existed. Guarding here
 * keeps the site viewable without credentials; supplying the
 * VITE_FIREBASE_* variables is all that is needed to switch Firebase
 * back on — nothing downstream changes.
 */
// getApps()/getApp() also guard against re-initialization during HMR.
const app = isFirebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export default app;
