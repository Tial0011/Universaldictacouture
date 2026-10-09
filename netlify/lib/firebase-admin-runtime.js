import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { AccountError } from "./account-contract.js";

export const STARTUP_STAGES = Object.freeze([
  "project-resolution",
  "credential-validation",
  "firebase-initialization",
  "origin-validation",
  "hmac-validation",
  "client-creation",
]);

export function accountRuntime(env = process.env) {
  let stage = "project-resolution";
  try {
    const projectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
    const emulator = Boolean(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST);
    if (!projectId || (emulator && (!projectId.startsWith("demo-") || !env.FIRESTORE_EMULATOR_HOST || !env.FIREBASE_AUTH_EMULATOR_HOST
      || !/^127\.0\.0\.1:\d+$/.test(env.FIRESTORE_EMULATOR_HOST) || !/^127\.0\.0\.1:\d+$/.test(env.FIREBASE_AUTH_EMULATOR_HOST)))) throw Error();

    let credential;
    if (!emulator) {
      stage = "credential-validation";
      const service = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || "null");
      if (!service || service.project_id !== projectId) throw Error();
      credential = cert(service);
    }

    stage = "firebase-initialization";
    const name = `udc-account-${projectId}`;
    const app = getApps().find(entry => entry.name === name) || initializeApp({ projectId, ...(credential ? { credential } : {}) }, name);

    stage = "origin-validation";
    const url = new URL(env.UDC_SITE_ORIGIN);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (!emulator && url.protocol !== "https:") || (emulator && !["127.0.0.1", "localhost"].includes(url.hostname))) throw Error();
    const origin = url.origin;

    stage = "hmac-validation";
    const secret = env.UDC_IDENTITY_HMAC_KEY;
    if (!secret || secret.length < 32) throw Error();

    stage = "client-creation";
    return { db: getFirestore(app), auth: getAuth(app), secret, origin, projectId, emulator };
  } catch {
    console.error(`[account-startup-failure] stage=${stage}`);
    const error = new AccountError("account-source-unavailable", 503);
    error.stage = stage;
    throw error;
  }
}
