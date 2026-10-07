import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, documentId, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { studioStaff, route } from "./staff-fixtures.mjs";
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: "demo-udc-section12-rules", firestore: { host: "127.0.0.1", port: 8089, rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } }); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await setDoc(doc(store, "admins/studio"), studioStaff());
    await setDoc(doc(store, "admins/legacy"), { active: true, role: "Super Admin" });
    await setDoc(doc(store, "admins/narrow"), { active: true, staffId: "s-narrow", capabilities: { "products.read": { selectedObject: { active: true, purpose: "catalogue", ids: ["p1"] } }, "chats.read": { assignmentDerived: { active: true, purpose: "customer-service" } } } });
    for (const id of ["p1", "p2"]) await setDoc(doc(store, "products", id), { name: id, status: "draft", archived: false, _version: 1 });
    for (const [id, staffId] of [["c1", "s-narrow"], ["c2", "other"]]) {
      await setDoc(doc(store, "conversations", id), { customerId: id, assignedStaffId: staffId });
      await setDoc(doc(store, "conversations", id, "messages", "m"), { body: "Private", senderId: id });
    }
  });
});
after(async () => { await env?.cleanup(); });
const client = uid => env.authenticatedContext(uid, { email: uid + "@example.test" }).firestore();
test("legacy active membership and governance title give no business access", async () => {
  const store = client("legacy");
  for (const path of ["products/p1", "conversations/c1", "conversations/c1/messages/m", "customerProfiles/other", "payments/p"]) await assertFails(getDoc(doc(store, path)));
  await assertFails(setDoc(doc(store, "admins/legacy"), studioStaff()));
});
test("selected object queries cannot widen into full-domain discovery", async () => {
  const store = client("narrow");
  await assertSucceeds(getDoc(doc(store, "products/p1")));
  await assertFails(getDoc(doc(store, "products/p2")));
  await assertSucceeds(getDocs(query(collection(store, "products"), where(documentId(), "in", ["p1"]), limit(20))));
  await assertFails(getDocs(query(collection(store, "products"), limit(20))));
});
test("assignment is resource-specific and read never implies reply", async () => {
  const store = client("narrow");
  await assertSucceeds(getDoc(doc(store, "conversations/c1")));
  await assertSucceeds(getDocs(query(collection(store, "conversations/c1/messages"), limit(30))));
  await assertFails(getDoc(doc(store, "conversations/c2")));
  await assertSucceeds(getDocs(query(collection(store, "conversations"), where("assignedStaffId", "==", "s-narrow"), limit(20))));
  await assertFails(updateDoc(doc(store, "conversations/c1"), { lastMessage: "Forged" }));
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), "conversations/c1"), { assignedStaffId: "other" }));
  await assertFails(getDoc(doc(store, "conversations/c1/messages/m")));
});
test("revocation and wrong purpose close previously permitted exact routes", async () => {
  const store = client("studio");
  await assertSucceeds(getDoc(doc(store, "products/p1")));
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), "admins/studio"), { capabilities: { "products.read": route("payment-operations") } }));
  await assertFails(getDoc(doc(store, "products/p1")));
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), "admins/studio"), { active: false }));
  await assertFails(getDoc(doc(store, "products/p1")));
});
function saveProduct(store, operation, version = 2, extra = {}) {
  const batch = writeBatch(store);
  batch.update(doc(store, "products/p1"), { name: "Updated", _version: version, _lastOperationId: operation, updatedAt: serverTimestamp(), ...extra });
  batch.set(doc(store, "staffAudit", operation), { actorUid: "studio", actorStaffId: "staff-studio", execution: "staff", targetCollection: "products", targetId: "p1", action: "save", outcome: "committed", createdAt: serverTimestamp() });
  return batch.commit();
}
test("protected Product writes require atomic immutable audit and first current version", async () => {
  const store = client("studio");
  await assertFails(updateDoc(doc(store, "products/p1"), { name: "Unaudited", _version: 2 }));
  await assertSucceeds(saveProduct(store, "operation-1"));
  assert.equal((await getDoc(doc(store, "staffAudit/operation-1"))).data().actorStaffId, "staff-studio");
  await assertFails(saveProduct(store, "stale-operation", 2));
  await assertFails(updateDoc(doc(store, "staffAudit/operation-1"), { outcome: "changed" }));
  await assertFails(deleteDoc(doc(store, "staffAudit/operation-1")));
});
test("concurrent writes based on one version have exactly one winner", async () => {
  const store = client("studio");
  const results = await Promise.allSettled([saveProduct(store, "race-a"), saveProduct(store, "race-b")]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
});
test("operation-result authority permits only exact own receipts, never Audit listing", async () => {
  const store = client("studio");
  await saveProduct(store, "own-operation");
  const staff = studioStaff();
  delete staff.capabilities["audit.read"];
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "admins/studio"), staff);
    await setDoc(doc(context.firestore(), "staffAudit/other-operation"), { actorUid: "other", actorStaffId: "staff-other" });
  });
  await assertSucceeds(getDoc(doc(store, "staffAudit/own-operation")));
  await assertFails(getDoc(doc(store, "staffAudit/other-operation")));
  await assertFails(getDocs(query(collection(store, "staffAudit"), limit(20))));
  staff.staffId = "staff-rebound";
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), "admins/studio"), staff));
  await assertFails(getDoc(doc(store, "staffAudit/own-operation")));
  staff.staffId = "staff-studio";
  delete staff.capabilities["operations.reconcile"];
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), "admins/studio"), staff));
  await assertFails(getDoc(doc(store, "staffAudit/own-operation")));
});
test("publication capability and retained first-publication evidence are independent", async () => {
  const store = client("studio");
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), "admins/studio"), { capabilities: { "products.read": route("catalogue"), "products.edit": route("catalogue") } }));
  await assertFails(saveProduct(store, "publish-without-authority", 2, { status: "published", price: 10, unitLabel: "each", category: ["Aso Oke"], images: ["image"] }));
});
test("published records cannot be generically saved live; lifecycle actions use canonical Unpublished", async () => {
  const store = client("studio");
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), "products/p1"), { status: "published", price: 10, unitLabel: "per piece", category: ["Aso Oke"], images: ["image"] }));
  await assertFails(saveProduct(store, "generic-live-save"));
  const transition = async (operation, status, action, version) => {
    const batch = writeBatch(store);
    batch.update(doc(store, "products/p1"), { status, archived: status === "archived", _version: version, _lastOperationId: operation, updatedAt: serverTimestamp() });
    batch.set(doc(store, "staffAudit", operation), { actorUid: "studio", actorStaffId: "staff-studio", execution: "staff", targetCollection: "products", targetId: "p1", action, outcome: "committed", createdAt: serverTimestamp() });
    return batch.commit();
  };
  await assertFails(transition("old-unpublish", "draft", "unpublish", 2));
  await assertSucceeds(transition("unpublish", "unpublished", "unpublish", 2));
  await assertSucceeds(transition("archive", "archived", "archive", 3));
  await assertFails(transition("old-restore", "draft", "restore", 4));
  await assertSucceeds(transition("restore", "unpublished", "restore", 4));
});
test("Product field-family capabilities cannot be borrowed from content editing", async () => {
  const store = client("studio");
  const staff = { active: true, staffId: "staff-studio", capabilities: { "products.read": route("catalogue"), "products.edit": route("catalogue"), "operations.reconcile": route("operation-result") } };
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), "admins/studio"), staff));
  await assertFails(saveProduct(store, "unauthorized-price", 2, { price: 99 }));
  await assertFails(saveProduct(store, "unauthorized-media", 2, { images: ["image"] }));
  await assertFails(saveProduct(store, "unauthorized-discovery", 2, { category: ["New label"] }));
  delete staff.capabilities["products.edit"];
  staff.capabilities["products.commercial"] = route("catalogue");
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), "admins/studio"), staff));
  await assertFails(saveProduct(store, "unauthorized-name", 2, { price: 99 }));
  await assertSucceeds(saveProduct(store, "authorized-price", 2, { name: "p1", price: 99 }));
});
test("destructive historical operations and obsolete review mutation stay denied", async () => {
  const store = client("studio");
  await assertFails(deleteDoc(doc(store, "products/p1")));
  await assertFails(setDoc(doc(store, "reviews/r"), { status: "published", productQualityRating: 5 }));
  await assertFails(getDocs(collection(store, "admins")));
  await assertFails(getDocs(query(collection(client("narrow"), "staffAudit"), limit(20))));
});
test("ordinary saves cannot invent publication history or add unknown private fields", async () => {
  const store = client("studio");
  await assertFails(saveProduct(store, "invented-publication", 2, { publishedAt: serverTimestamp() }));
  await assertFails(saveProduct(store, "unknown-private-field", 2, { privateCustomerPhone: "private-test-value" }));
});
test("Draft creation uses its own capability and authoritative creation evidence", async () => {
  const store = client("studio");
  const staff = { active: true, staffId: "staff-studio", capabilities: { "products.create": route("catalogue"), "products.read": route("catalogue"), "operations.reconcile": route("operation-result") } };
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), "admins/studio"), staff));
  const batch = writeBatch(store);
  batch.set(doc(store, "products/new-draft"), { name: "New Draft", status: "draft", archived: false, _version: 1, _lastOperationId: "create-draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(store, "staffAudit/create-draft"), { actorUid: "studio", actorStaffId: "staff-studio", execution: "staff", targetCollection: "products", targetId: "new-draft", action: "save", outcome: "committed", createdAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  await assertFails(saveProduct(store, "create-does-not-grant-edit", 2));
});
