import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Evaluate the real auth service against an isolated Firebase adapter.
// This checks callback ordering without creating accounts or sending email.
async function loadAuthService({ failure = false } = {}) {
  const storage = new Map([["udc:auth:session-policy", JSON.stringify({ expiresAt: 1 })]]);
  const context = vm.createContext({
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    sessionStorage: { setItem() {}, removeItem() {} },
  });
  let service;
  let expiredDuringCallback;
  const instance = {};
  const user = { uid: "test-user" };
  const authenticate = async () => {
    expiredDuringCallback = service.namespace.sessionPolicyExpired();
    if (failure) throw new Error("invalid credentials");
    return { user };
  };
  const exports = {
    browserLocalPersistence: "local", getAuth: () => instance,
    createUserWithEmailAndPassword: authenticate, signInWithEmailAndPassword: authenticate,
    setPersistence: async () => {}, onAuthStateChanged: () => () => {},
    signOut: async () => {}, updateProfile: async (account, details) => Object.assign(account, details),
    verifyBeforeUpdateEmail: async () => {},
  };
  const sdk = new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  const config = new vm.SyntheticModule(["default", "isFirebaseConfigured"], function () { this.setExport("default", {}); this.setExport("isFirebaseConfigured", true); }, { context });
  service = new vm.SourceTextModule(await readFile(new URL("../src/firebase/auth.js", import.meta.url), "utf8"), { context, initializeImportMeta(meta) { meta.env = {}; } });
  await service.link(specifier => specifier === "firebase/auth" ? sdk : config);
  await service.evaluate();
  return { auth: service.namespace, storage, user, duringCallback: () => expiredDuringCallback };
}

test("sign-in renews an expired policy without the auth listener signing the customer out", async () => {
  const subject = await loadAuthService();
  assert.equal(subject.auth.sessionPolicyExpired(), true);
  await subject.auth.signIn("test@example.com", "password");
  assert.equal(subject.duringCallback(), false);
  assert.equal(subject.auth.sessionPolicyExpired(), false);
});

test("failed sign-in preserves expiry and releases the in-progress guard", async () => {
  const subject = await loadAuthService({ failure: true });
  await assert.rejects(subject.auth.signIn("test@example.com", "incorrect"), /invalid credentials/);
  assert.equal(subject.auth.sessionPolicyExpired(), true);
});

test("registration creates the account before independently retryable name setup", async () => {
  const subject = await loadAuthService();
  const result = await subject.auth.signUp("test@example.com", "password", { keepSignedIn: true });
  assert.equal(result.user, subject.user);
  assert.equal(subject.duringCallback(), false);
  await subject.auth.updateAccountName(result.user, "Test Customer");
  assert.equal(subject.user.displayName, "Test Customer");
  const policy = JSON.parse(subject.storage.get("udc:auth:session-policy"));
  assert.equal(policy.keepSignedIn, true);
  assert.ok(policy.expiresAt > Date.now() + 29 * 24 * 60 * 60 * 1000);
});
