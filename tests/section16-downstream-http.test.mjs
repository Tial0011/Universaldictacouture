import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createAccountHandler } from "../netlify/lib/account-handler.js";
import { createAccountService } from "../netlify/lib/account-service.js";
import { createSystemMaintenance } from "../netlify/lib/system-maintenance.js";

test("M13-M16 actual emulator token → managed Staff cookie → protected configuration → durable event → Audit", async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8089"; process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"; process.env.METADATA_SERVER_DETECTION = "none";
  const app = initializeApp({ projectId: "demo-udc-section12" }, "part4-http-" + randomUUID()), auth = getAuth(app), db = getFirestore(app);
  const uid = randomUUID(), staffId = randomUUID(), email = `part4-http-${uid}@example.test`, password = "Part4-HTTP-Fixture-Password!", secret = "part4-http-local-test-secret-not-production", origin = "http://127.0.0.1:5182";
  try {
    await auth.createUser({ uid, email, password, emailVerified: true });
    await db.doc("staffIdentities/" + staffId).set({ staffId, principalUid: uid, active: true });
    await db.doc("admins/" + uid).set({ active: true, staffId, capabilities: Object.fromEntries(["read", "edit"].map(action => [`settings.bank.${action}`, { governance: { active: true, purpose: "financial-settings", area: "financial-settings", ids: ["bank-transfer"] } }])) });
    const loginResponse = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-test-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    const login = await loginResponse.json(); assert.ok(login.idToken);
    const runtime = { auth, db, secret, origin }, handler = createAccountHandler(runtime); let cookie;
    async function request(action, input = {}, read = false) {
      const url = new URL("/.netlify/functions/account", origin); url.searchParams.set("action", action); if (read) for (const [key, value] of Object.entries(input)) url.searchParams.set(key, String(value));
      const response = await handler(new Request(url, { method: read ? "GET" : "POST", headers: { Origin: origin, Authorization: "Bearer " + login.idToken, ...(cookie ? { Cookie: cookie } : {}), ...(!read ? { "Content-Type": "application/json" } : {}) }, ...(!read ? { body: JSON.stringify(input) } : {}) }));
      if (action === "session-start") cookie = response.headers.get("set-cookie")?.split(";")[0]; return { status: response.status, value: await response.json() };
    }
    assert.equal((await request("staff-configuration", { configurationId: "bank-transfer" }, true)).status, 401);
    assert.equal((await request("session-start", { kind: "staff", keepSignedIn: false, label: "isolated Part4 HTTP fixture" })).status, 200);
    const current = await request("staff-configuration", { configurationId: "bank-transfer" }, true); assert.equal(current.status, 200);
    const operationId = randomUUID(), draft = await request("staff-configuration-mutate", { operationId, configurationId: "bank-transfer", action: "draft", expectedVersion: current.value.version, value: { bankName: "ISOLATED TEST BANK", accountName: "Fixture only", accountNumber: "0000000000" } }); assert.equal(draft.status, 200);
    assert.equal((await request("configuration-operation", { operationId }, true)).value.version, draft.value.version);
    const activated = await request("staff-configuration-mutate", { operationId: randomUUID(), configurationId: "bank-transfer", action: "activate", expectedVersion: draft.value.version, proposedVersion: draft.value.proposedVersion }); assert.equal(activated.status, 200);
    assert.equal((await request("staff-configuration", { configurationId: "bank-transfer" }, true)).value.effective.effectiveVersion, draft.value.proposedVersion);
    const eventId = createAccountService(runtime).keyed(`event:configuration:${operationId}`), system = createSystemMaintenance(createAccountService(runtime));
    assert.ok((await system.processEvent(eventId, { leaseMs: 1000, maxAttempts: 2 })).jobs.every(job => job.state === "applied"));
    assert.equal((await db.collection("formalAudit").where("eventId", "==", eventId).get()).size, 1);
    await db.doc("admins/" + uid).update({ active: false }); assert.equal((await request("staff-configuration", { configurationId: "bank-transfer" }, true)).status, 403);
  } finally { await db.terminate(); await deleteApp(app); }
});
