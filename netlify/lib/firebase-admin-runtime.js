import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { AccountError } from "./account-contract.js";

export function accountRuntime(env = process.env) {
  const projectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
  const emulator = Boolean(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST);
  if (!projectId || (emulator && (!projectId.startsWith("demo-") || !env.FIRESTORE_EMULATOR_HOST || !env.FIREBASE_AUTH_EMULATOR_HOST
    || !/^127\.0\.0\.1:\d+$/.test(env.FIRESTORE_EMULATOR_HOST) || !/^127\.0\.0\.1:\d+$/.test(env.FIREBASE_AUTH_EMULATOR_HOST)))) throw new AccountError("account-source-unavailable", 503);
  let credential;
  if (!emulator) {
    try {
      const service = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || "null");
      if (!service || service.project_id !== projectId) throw Error();
      credential = cert(service);
    } catch { throw new AccountError("account-source-unavailable", 503); }
  }
  const name = `udc-account-${projectId}`;
  const app = getApps().find(entry => entry.name === name) || initializeApp({ projectId, ...(credential ? { credential } : {}) }, name);
  const secret = env.UDC_IDENTITY_HMAC_KEY;
  let origin;
  try {
    const url = new URL(env.UDC_SITE_ORIGIN);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (!emulator && url.protocol !== "https:") || (emulator && !["127.0.0.1", "localhost"].includes(url.hostname))) throw Error();
    origin = url.origin;
  } catch { throw new AccountError("account-source-unavailable", 503); }
  if (!secret || secret.length < 32) throw new AccountError("account-source-unavailable", 503);
  return { db: getFirestore(app), auth: getAuth(app), secret, origin, projectId, emulator };
}
