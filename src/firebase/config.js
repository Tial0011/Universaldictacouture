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

// Guard against re-initialization during HMR.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export default app;
