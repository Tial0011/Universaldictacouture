import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createAccountService } from "../netlify/lib/account-service.js";
import { createDownstreamWorker } from "../netlify/lib/downstream-worker.js";
import { createConfigurationService, renderTemplate } from "../netlify/lib/shared-configuration.js";
import { createOwnerProjections } from "../netlify/lib/owner-projections.js";
import { createNotificationDelivery } from "../netlify/lib/notification-delivery.js";
import { createRuntimeIntegrity, failureClass, safeObservation, verifyRecovery } from "../netlify/lib/runtime-integrity.js";
import { createSystemMaintenance } from "../netlify/lib/system-maintenance.js";
import { createAccountHandler } from "../netlify/lib/account-handler.js";
import maintenanceFunction from "../netlify/functions/owner-maintenance.js";
import { AccountError } from "../netlify/lib/account-contract.js";
import { createIntentMigration } from "../netlify/lib/intent-migration.js";

const id = () => randomUUID(), policy = { leaseMs: 1000, maxAttempts: 2 }; // isolated fixture policy, not operational defaults
let app, auth, db, account, config, time, a, staff, templateId;
before(async () => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"; process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8089"; process.env.METADATA_SERVER_DETECTION = "none";
  app = initializeApp({ projectId: "demo-udc-s16p4-" + id().slice(0, 8) }, "part4-" + id()); auth = getAuth(app); db = getFirestore(app); time = Date.now();
  account = createAccountService({ auth, db, secret: "part4-local-emulator-secret-not-production", now: () => time }); config = createConfigurationService(account);
  const email = "part4-" + id() + "@example.test"; await account.register({ email, password: "Part4-Local-Password!", operationId: id() });
  const provider = await auth.getUserByEmail(email); a = { uid: provider.uid, auth_time: Math.floor(time / 1000) }; a.context = await account.context(a);
  const uid = id(), staffId = id(); staff = { uid, staffId, kind: "staff", auth_time: a.auth_time };
  await db.doc("staffIdentities/" + staffId).set({ staffId, principalUid: uid, active: true });
  await db.doc("admins/" + uid).set({ staffId, active: true, capabilities: {
    "settings.bank.edit": { governance: { active: true, purpose: "financial-settings", area: "financial-settings", ids: ["bank-transfer"] } },
    "settings.bank.read": { governance: { active: true, purpose: "financial-settings", area: "financial-settings", ids: ["bank-transfer"] } },
    "settings.templates.edit": { selectedObject: { active: true, purpose: "communication-settings", ids: ["template:styleCircle"] } },
    "settings.templates.read": { selectedObject: { active: true, purpose: "communication-settings", ids: ["template:styleCircle"] } },
    "orders.read": { selectedObject: { active: true, purpose: "order-operations", ids: ["allowed-order"] } },
  } }); templateId = "template:styleCircle";
});
after(async () => { await db?.terminate(); await deleteApp(app); });
async function event(effect = "audit") {
  const eventId = account.keyed(id()); await db.doc("ownerEvents/" + eventId).set({ eventId, domain: "fixture", operationId: id(), action: "qualified-fixture", target: a.context.accountId, actor: { kind: "customer", accountId: a.context.accountId }, executor: "system:fixture", committedAt: time, effects: [effect] }); return eventId;
}
async function activateTemplate(body = "{{brandName}} {{actionLabel}} {{safePath}}") {
  const current = await config.read(staff, templateId), draft = await config.mutate(staff, { configurationId: templateId, action: "draft", expectedVersion: current.version, value: { subject: "Style Circle", body }, operationId: id() });
  return config.mutate(staff, { configurationId: templateId, action: "activate", proposedVersion: draft.proposedVersion, expectedVersion: draft.version, operationId: id() });
}
test("M13 owner commit and event are atomic, retries create one event, private fields excluded", async () => {
  const profile = await account.readProfile(a), operationId = id(), input = { operationId, expectedEpoch: 1, expectedVersion: profile.version, fields: { preferredName: "PRIVATE PROFILE NEVER IN EVENT" } };
  await account.saveProfile(a, input); await account.saveProfile(a, input);
  const rows = await db.collection("ownerEvents").where("operationId", "==", operationId).get(); assert.equal(rows.size, 1); assert.ok(!JSON.stringify(rows.docs[0].data()).includes("PRIVATE PROFILE"));
  const aborted = account.keyed(id()); await assert.rejects(db.runTransaction(async tx => { tx.create(db.doc("ownerEvents/" + aborted), { eventId: aborted }); throw Error("abort fixture"); })); assert.equal((await db.doc("ownerEvents/" + aborted).get()).exists, false);
});
test("M13 duplicate materialization and concurrent audit execution converge once with actor/executor separation", async () => {
  const worker = createDownstreamWorker(account), eventId = await event(), materialized = await Promise.all([worker.materialize(eventId), worker.materialize(eventId)]);
  assert.equal(materialized[0].jobId, materialized[1].jobId); const jobId = materialized[0].jobId;
  await Promise.all([worker.run(jobId, policy), worker.run(jobId, policy)]); assert.equal((await worker.run(jobId, policy)).state, "applied");
  const audit = (await db.doc("formalAudit/" + jobId).get()).data(); assert.equal(audit.actor.kind, "customer"); assert.equal(audit.executor, "system:audit-worker"); assert.equal(audit.result, "committed");
  assert.equal((await db.collection("formalAudit").where("eventId", "==", eventId).get()).size, 1);
});
test("M13 crash/ack loss reconciles external effect without replay; unknown is never failure", async () => {
  let applied = false, calls = 0; const worker = createDownstreamWorker(account, { fixture: {
    reconcile: async () => applied ? "applied" : "not-applied", eligible: async () => true,
    apply: async () => { calls++; applied = true; throw Error("acknowledgement lost after effect"); },
  } });
  const { jobId } = await worker.materialize(await event("fixture"), "fixture"); assert.equal((await worker.run(jobId, policy)).state, "unknown");
  assert.equal((await worker.run(jobId, policy)).state, "applied"); assert.equal(calls, 1);
  const uncertain = createDownstreamWorker(account, { fixture: { reconcile: async () => "unknown", apply: async () => { throw Error("must not apply"); } } });
  const next = await uncertain.materialize(await event("fixture"), "fixture"); assert.equal((await uncertain.run(next.jobId, policy)).state, "unknown"); assert.equal((await db.doc("downstreamJobs/" + next.jobId).get()).data().attempts, 0);
});
test("M13 expired lease, bounded technical attempts and missing policy fail safely", async () => {
  let calls = 0; const worker = createDownstreamWorker(account, { fixture: { reconcile: async () => "not-applied", eligible: async () => true, apply: async () => { calls++; return "not-applied"; } } });
  const { jobId } = await worker.materialize(await event("fixture"), "fixture"); await assert.rejects(worker.run(jobId, null), { code: "worker-policy-required" });
  await db.doc("downstreamJobs/" + jobId).update({ state: "running", lease: { id: "old-worker", expiresAt: time - 1 } });
  await worker.run(jobId, policy); await worker.run(jobId, policy); assert.equal((await worker.run(jobId, policy)).state, "needs-attention"); assert.equal(calls, 2);
});
test("M14 bank capability/governance/freshness, draft/effective separation, stale edits and reconciliation", async () => {
  const input = { configurationId: "bank-transfer", action: "draft", expectedVersion: 0, operationId: id(), value: { bankName: "TEST BANK", accountName: "Fixture only", accountNumber: "0000000000" } };
  await assert.rejects(config.mutate(a, input), { code: "permission-denied" }); await assert.rejects(config.mutate({ ...staff, auth_time: staff.auth_time - 600 }, input), { code: "permission-denied" });
  const draft = await config.mutate(staff, input); assert.equal((await config.read(staff, "bank-transfer")).effective, null);
  const results = await Promise.allSettled([1, 2].map(() => config.mutate(staff, { configurationId: "bank-transfer", expectedVersion: draft.version, proposedVersion: draft.proposedVersion, action: "activate", operationId: id() }))); assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.deepEqual(await config.mutate(staff, input), draft); assert.equal((await config.reconcile(staff, input.operationId)).version, draft.version); assert.equal((await config.reconcile(a, input.operationId)).state, "unknown");
  await assert.rejects(config.mutate(staff, { ...input, configurationId: "deny-by-default", operationId: id() }), { code: "configuration-not-supported" });
});
test("M14 templates forbid arbitrary/private expressions; preview does not activate or send", async () => {
  await activateTemplate(); const current = await config.read(staff, templateId);
  await assert.rejects(config.mutate(staff, { configurationId: templateId, action: "draft", expectedVersion: current.version, value: { subject: "Private", body: "{{password}}" }, operationId: id() }), { code: "template-variable-denied" });
  assert.throws(() => renderTemplate({ subject: "x", body: "{{db.accounts}}" }, {}), { code: "template-expression-denied" });
  assert.throws(() => renderTemplate({ subject: "x", body: "{{safePath}}" }, { safePath: "//evil.example" }), { code: "unsafe-return-target" });
  const preview = await config.preview(staff, { configurationId: templateId, value: { subject: "Preview", body: "{{brandName}}" }, context: { brandName: "UDC" } }); assert.equal(preview.state, "preview"); assert.equal((await config.read(staff, templateId)).version, current.version);
  const path = db.doc("admins/" + staff.uid), raw = (await path.get()).data(); await path.update({ active: false }); await assert.rejects(config.read(staff, templateId), { code: "permission-denied" }); await path.set(raw);
});
test("M13 optional send rereads consent, lifecycle and bound template; provider reconcile prevents duplicate send", async () => {
  const preferences = db.doc("accountPreferences/" + a.context.accountId); await preferences.update({ styleCircle: true });
  const sent = new Map(); let calls = 0;
  const delivery = createNotificationDelivery(account, config, { sourceApplicable: async () => true, provider: {
    reconcile: async key => sent.has(key) ? "applied" : "not-applied", send: async payload => { calls++; sent.set(payload.idempotencyKey, payload); throw Error("mail ack lost"); },
  } });
  const context = { brandName: "UDC", actionLabel: "View", safePath: "/shop" };
  const bound = await delivery.bind({ eventId: await event(), accountId: a.context.accountId, category: "styleCircle", context }); await activateTemplate("New future version");
  const worker = createDownstreamWorker(account, { notification: delivery.handler }); assert.equal((await worker.run(bound.jobId, policy)).state, "unknown"); assert.equal((await worker.run(bound.jobId, policy)).state, "applied"); assert.equal(calls, 1); assert.equal(sent.get(bound.jobId).body, "UDC View /shop");
  const withdrawn = await delivery.bind({ eventId: await event(), accountId: a.context.accountId, category: "styleCircle", context }); await preferences.update({ styleCircle: false }); assert.equal((await worker.run(withdrawn.jobId, policy)).state, "suppressed");
  await preferences.update({ styleCircle: true }); const deleted = await delivery.bind({ eventId: await event(), accountId: a.context.accountId, category: "styleCircle", context }); await db.doc("accounts/" + a.context.accountId).update({ lifecycle: "DELETED-CUSTOMER REQUESTED" }); assert.equal((await worker.run(deleted.jobId, policy)).state, "suppressed"); assert.equal(calls, 1); await db.doc("accounts/" + a.context.accountId).update({ lifecycle: "ACTIVE" });
});
test("M15 stale Product index cannot expose Unpublished source, rebuild reads current owner not old event", async () => {
  const productId = id(), source = db.doc("products/" + productId), representation = { name: "Public Fixture", price: 1000, slug: "fixture", unitLabel: "per set", category: ["Aso Oke"], images: [{ url: "https://example.test/fixture.jpg" }] }; await source.set({ status: "published", _ownerVersion: 2, _version: 1, publicVersion: 1, publicRepresentation: representation, privateNotes: "NEVER" });
  const projections = createOwnerProjections(account); await projections.rebuildProduct(productId); assert.equal((await projections.publicSearch("Public Fixture")).count, 1);
  await source.update({ status: "unpublished", _version: 2 }); assert.equal((await projections.publicSearch("Public Fixture")).count, 0); assert.ok((await db.doc("productReadModels/" + productId).get()).exists);
  await projections.rebuildProduct(productId); assert.equal((await db.doc("productReadModels/" + productId).get()).exists, false);
  await source.update({ status: "published", publicVersion: 3, publicRepresentation: { ...representation, name: "Current expression", price: 2000 } }); await Promise.all([projections.rebuildProduct(productId), projections.rebuildProduct(productId)]); assert.equal((await db.doc("productReadModels/" + productId).get()).data().sourceVersion, 3); assert.ok(!JSON.stringify(await projections.publicSearch()).includes("NEVER"));
});
test("M15 Staff Search hides rows/counts, revalidates current grants and even empty-search identity", async () => {
  await db.doc("orders/allowed-order").set({ _ownerVersion: 3, orderId: "allowed-order", status: "OPEN", currentWork: "base" }); await db.doc("orders/hidden-order").set({ _ownerVersion: 3, orderId: "hidden-order", status: "OPEN", currentWork: "base", privateNotes: "NEVER" });
  const projections = createOwnerProjections(account), result = await projections.staffOrders(staff); assert.equal(result.count, 1); assert.equal(result.records[0].orderId, "allowed-order"); assert.ok(!JSON.stringify(result).includes("hidden-order"));
  await db.doc("staffIdentities/" + staff.staffId).update({ active: false }); await assert.rejects(projections.staffOrders(staff, "no matches"), { code: "staff-inactive" }); await db.doc("staffIdentities/" + staff.staffId).update({ active: true });
  const membership = db.doc("admins/" + staff.uid), raw = (await membership.get()).data(); await membership.update({ capabilities: {} }); await assert.rejects(projections.staffOrders(staff), { code: "permission-denied" }); await membership.set(raw);
  await db.doc("orders/allowed-order").delete(); await db.doc("orders/hidden-order").delete();
});
test("M16 audit is minimized and purpose-scoped; diagnostic classes exclude exception payloads", async () => {
  const worker = createDownstreamWorker(account), { jobId } = await worker.materialize(await event()); await worker.run(jobId, policy); const integrity = createRuntimeIntegrity(account);
  await assert.rejects(integrity.auditRead(staff, jobId), { code: "permission-denied" });
  const membership = db.doc("admins/" + staff.uid), raw = (await membership.get()).data(); await membership.update({ capabilities: { ...raw.capabilities, "audit.read": { dataPurpose: { active: true, purpose: "audit", ids: [jobId], dataClasses: ["audit-evidence"] } } } });
  await db.doc("formalAudit/" + jobId).update({ unsafeFutureField: "PRIVATE NEVER RETURNED" }); assert.ok(!JSON.stringify(await integrity.auditRead(staff, jobId)).includes("PRIVATE"));
  assert.equal(failureClass(new AccountError("stale-conflict", 409)), "STALE / CONFLICT"); assert.equal(failureClass(new AccountError("effect-outcome-unknown", 503)), "OUTCOME UNKNOWN"); assert.ok(!JSON.stringify(safeObservation(Error("TOKEN PRIVATE"))).includes("TOKEN")); await membership.set(raw);
});
test("M16 restored bytes are not verified recovery; missing/failed current evidence blocks exposure", async () => {
  const integrity = createRuntimeIntegrity(account), baseline = await integrity.inspect(); assert.equal(baseline.readOnly, true);
  const missing = await verifyRecovery({ integrity, restorationId: id() }); assert.equal(missing.mayExpose, false); assert.equal(missing.state, "unresolved-recovery");
  const gates = ["identity-security", "references-history", "application-readiness", "current-authority", "projection-readiness"], verifiers = Object.fromEntries(gates.map(gate => [gate, async () => ({ state: "passed", evidenceId: "fixture-check:" + gate })]));
  verifiers["current-authority"] = async () => ({ state: "unknown" }); assert.equal((await verifyRecovery({ integrity, restorationId: id(), verifiers })).mayExpose, false);
});
test("M13/M16 maintenance cannot be invoked with a browser origin, missing worker secret or arbitrary job payload", async () => {
  const previous = process.env.UDC_WORKER_KEY; delete process.env.UDC_WORKER_KEY;
  assert.equal((await maintenanceFunction(new Request("https://example.test/maintenance", { method: "POST", body: "{}" }))).status, 403);
  process.env.UDC_WORKER_KEY = "local-fixture-worker-key-not-production";
  assert.equal((await maintenanceFunction(new Request("https://example.test/maintenance", { method: "POST", headers: { Origin: "https://example.test", Authorization: "Bearer " + process.env.UDC_WORKER_KEY }, body: "{}" }))).status, 403);
  assert.equal((await maintenanceFunction(new Request("https://example.test/maintenance", { method: "POST", headers: { Authorization: "Bearer " + process.env.UDC_WORKER_KEY }, body: JSON.stringify({ eventIds: [], handlers: {} }) }))).status, 400);
  if (previous == null) delete process.env.UDC_WORKER_KEY; else process.env.UDC_WORKER_KEY = previous;
});
test("M13/M15 real Product event operator consumer builds current projection and formal Audit without owner mutation", async () => {
  const productId = id(), eventId = account.keyed(id()); await db.doc("products/" + productId).set({ status: "published", name: "Maintenance fixture", price: 1000, unitLabel: "per set", category: ["Aso Oke"], images: [{ url: "https://example.test/fixture.jpg" }] });
  await db.doc("ownerEvents/" + eventId).set({ eventId, domain: "pretransaction", operationId: id(), action: "product.publish", target: productId, actor: { kind: "staff", staffId: staff.staffId }, executor: "system:fixture", committedAt: time, effects: ["audit", "product-projection"] });
  const system = createSystemMaintenance(account); assert.ok((await system.processEvent(eventId, policy)).jobs.every(job => job.state === "applied")); assert.ok((await system.processEvent(eventId, policy)).jobs.every(job => job.state === "applied")); assert.equal((await db.doc("products/" + productId).get()).data().status, "published"); assert.ok((await db.doc("productReadModels/" + productId).get()).exists);
});
test("M14/M15 native HTTP boundary remains method/origin/token protected while public Search is minimized", async () => {
  const handler = createAccountHandler({ db, auth, secret: account.secret, origin: "http://127.0.0.1:5182" });
  const denied = await handler(new Request("http://127.0.0.1:5182/api?action=staff-configuration&configurationId=bank-transfer")); assert.equal(denied.status, 401);
  const wrongOrigin = await handler(new Request("http://127.0.0.1:5182/api?action=public-search", { headers: { Origin: "https://evil.example" } })); assert.equal(wrongOrigin.status, 403);
  const publicResponse = await handler(new Request("http://127.0.0.1:5182/api?action=public-search")); assert.equal(publicResponse.status, 200); assert.ok(!JSON.stringify(await publicResponse.json()).includes("privateNotes"));
});
test("M16 intent migration is explicit, resumable and preserves known commit time without inventing history", async () => {
  const repair = createIntentMigration(account), operationId = id(), fingerprint = account.keyed(id()), createdAt = time - 10000;
  await db.doc("transactionOperations/" + operationId).set({ state: "committed", fingerprint, actor: { kind: "customer", accountId: a.context.accountId }, action: "fixture.committed", target: "fixture-target", createdAt });
  await assert.rejects(repair({ domain: "transaction", operationId, expectedFingerprint: "wrong" }), { code: "migration-evidence-required" });
  const first = await repair({ domain: "transaction", operationId, expectedFingerprint: fingerprint }); assert.equal(first.state, "repaired"); assert.equal((await repair({ domain: "transaction", operationId, expectedFingerprint: fingerprint })).state, "already-present"); assert.equal((await db.doc("ownerEvents/" + first.eventId).get()).data().committedAt, createdAt);
  const missing = id(); await db.doc("transactionOperations/" + missing).set({ state: "committed", fingerprint, action: "unknown-actor", target: "fixture-target", createdAt }); await assert.rejects(repair({ domain: "transaction", operationId: missing, expectedFingerprint: fingerprint }), { code: "migration-provenance-unavailable" });
});
test("M16 governed bootstrap retains original Staff actor instead of relabelling target Account as Staff", async () => {
  const accountId = id(), principalUid = id(), email = `governed-${principalUid}@example.test`;
  await auth.createUser({ uid: principalUid, email, password: "Governed-Local-Password!" });
  await db.runTransaction(async tx => account.initialize(tx, { accountId, uid: principalUid, loginKey: account.keyed(email), createdBy: { kind: "staff", staffId: staff.staffId } }));
  const eventId = account.keyed(`event:account-bootstrap:${accountId}`), captured = (await db.doc("ownerEvents/" + eventId).get()).data(); assert.deepEqual(captured.actor, { kind: "staff", staffId: staff.staffId }); assert.equal(captured.target, accountId);
});
