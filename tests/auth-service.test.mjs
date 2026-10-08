import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as flow from '../src/services/authFlow.js';
import * as authority from '../src/services/customerAccountAuthority.js';
import { currentReadDeadline, protectedWriteDeadline } from '../src/services/operationalRuntime.js';

// Evaluate the real auth service against an isolated Firebase adapter.
// This checks callback ordering without creating accounts or sending email.
async function loadAuthService({ failure = false, delayed = false } = {}) {
  const storage = new Map([["udc:auth:session-policy", JSON.stringify({ expiresAt: 1 })]]);
  const context = vm.createContext({
    crypto: globalThis.crypto,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    sessionStorage: { setItem() {}, removeItem() {} },
  });
  let service;
  let expiredDuringCallback;
  const instance = {};
  const user = { uid: "test-user" };
  let release;
  const pending = delayed ? new Promise(resolve=>{release=resolve;}) : null;
  const authenticate = async () => {
    expiredDuringCallback = service.namespace.sessionPolicyExpired();
    if (failure) throw new Error("invalid credentials");
    if (pending) await pending;
    instance.currentUser = user;
    return { user };
  };
  const exports = {
    browserLocalPersistence: "local", getAuth: () => instance, reload: async()=>{}, getIdToken: async()=> 'fixture-token',
    createUserWithEmailAndPassword: authenticate, signInWithEmailAndPassword: authenticate,
    setPersistence: async () => {}, onAuthStateChanged: () => () => {},
    signOut: async () => {instance.currentUser=null;}, updateProfile: async (account, details) => Object.assign(account, details),
    verifyBeforeUpdateEmail: async () => {},
  };
  const sdk = new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  const config = new vm.SyntheticModule(["default", "isFirebaseConfigured"], function () { this.setExport("default", {}); this.setExport("isFirebaseConfigured", true); }, { context });
  service = new vm.SourceTextModule(await readFile(new URL("../src/firebase/auth.js", import.meta.url), "utf8"), { context, initializeImportMeta(meta) { meta.env = {}; } });
  const synthetic = entries => new vm.SyntheticModule(Object.keys(entries),function(){for(const [key,value] of Object.entries(entries))this.setExport(key,value);},{context});
  const unavailableAccountApi = { endManagedSessions:async()=>{}, registerCustomerAccount: async()=>{throw Object.assign(new Error('Unavailable backend fixture'),{code:'account-source-unavailable'});}, accountRequest: async()=>{throw Object.assign(new Error('Unavailable backend fixture'),{code:'account-source-unavailable'});} };
  await service.link(specifier => specifier === "firebase/auth" ? sdk : specifier.includes('accountApi') ? synthetic(unavailableAccountApi) : specifier.includes('authFlow') ? synthetic(flow) : specifier.includes('customerAccountAuthority') ? synthetic(authority) : specifier.includes('operationalRuntime') ? synthetic({currentReadDeadline,protectedWriteDeadline}) : config);
  await service.evaluate();
  return { auth: service.namespace, storage, user, instance, release, duringCallback: () => expiredDuringCallback };
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

test("registration stops before provider creation when trusted durable identity/bootstrap is unavailable", async () => {
  const subject = await loadAuthService();
  await assert.rejects(subject.auth.signUp("test@example.com", "a-long-test-password"), {code:'account-source-unavailable'});
  assert.equal(subject.duringCallback(),undefined);
  assert.equal(subject.auth.sessionPolicyExpired(),true);
});
test('competing sign-in is refused; a late response cannot revive a deliberately signed-out principal',async()=>{
  const subject=await loadAuthService({delayed:true});
  const first=subject.auth.signIn('test@example.test','fixture-password');
  await assert.rejects(subject.auth.signIn('other@example.test','fixture-password'),{code:'auth/operation-pending'});
  await subject.auth.signOutUser();subject.release();
  await assert.rejects(first,{code:'auth/principal-changed'});
  assert.equal(subject.instance.currentUser,null);
});
