import test from "node:test";
import assert from "node:assert/strict";
import { allows, canDiscover, currentStaff, SCOPE_FAMILIES, firestoreFields } from "../src/services/staffAuthorization.js";
import { attentionItems, operationalSummary, searchSummaries, ownerHref, reconcileUnknown, resultState } from "../src/services/operationsModel.js";
import { studioStaff } from "./staff-fixtures.mjs";
import { beginStaffOperation, clearStaffOperation, pendingStaffOperation } from "../src/services/staffOperations.js";

test("membership, role and Couturier flags do not independently grant permission", () => {
  for (const staff of [{ active: true }, { active: true, staffId: "s", role: "Super Admin", functionAsCouturier: true }, studioStaff(false)]) {
    assert.equal(allows(staff, "products.read", { purpose: "catalogue" }), false);
  }
  assert.equal(currentStaff({ active: true }), false);
  assert.equal(SCOPE_FAMILIES.length, 6);
});
test("incomplete routes never splice purpose, scope or capability", () => {
  const staff = { active: true, staffId: "s", capabilities: { "chats.read": {
    selectedObject: { active: true, purpose: "payment-operations", ids: ["c"] },
    assignmentDerived: { active: false, purpose: "customer-service" },
  } } };
  assert.equal(allows(staff, "chats.read", { purpose: "customer-service", objectId: "c", assignedStaffId: "s" }), false);
});
test("selected object and assignment routes are independently complete and current", () => {
  const staff = { active: true, staffId: "s", functionAsCouturier: true, eligible: true, capabilities: { "chats.read": { assignmentDerived: { active: true, purpose: "customer-service" } } } };
  assert.equal(allows(staff, "chats.read", { purpose: "customer-service", objectId: "c", assignedStaffId: "s" }), true);
  assert.equal(allows(staff, "chats.reply", { purpose: "customer-service", objectId: "c", assignedStaffId: "s" }), false);
  assert.equal(allows(staff, "chats.read", { purpose: "customer-service", objectId: "c", assignedStaffId: "other" }), false);
  assert.equal(canDiscover(staff, "payments"), false);
});
test("attention fuses owner signals, excludes resolved sources and never fabricates urgency or age", () => {
  const p = operationalSummary("products", { id: "p", name: "Draft", status: "draft" });
  const archived = operationalSummary("products", { id: "archived", status: "archived" });
  const reply = operationalSummary("chats", { id: "c", lastSenderRole: "admin" });
  const items = attentionItems([p, p, archived, reply]);
  assert.equal(items.length, 1);
  assert.equal(items[0].attentionSince, null);
  assert.equal(items[0].priority, null);
  assert.equal(items[0].state, "Needs action");
  assert.equal(items[0].ownerState, p.state);
  assert.equal(operationalSummary("chats", { id: "without-assignment" }).assignedStaffId, null);
});
test("safe previews contain no Chat content, customer contact, media or legacy ratings", () => {
  const raw = { id: "c", customerEmail: "private@test", lastMessage: "secret", image: "private-url", productQualityRating: 5 };
  for (const domain of ["chats", "reviews"]) {
    const summary = operationalSummary(domain, raw);
    assert.equal(JSON.stringify(summary).includes("secret"), false);
    assert.equal(JSON.stringify(summary).includes("private"), false);
    assert.equal(summary.productQualityRating, undefined);
  }
});
test("search ranks exact stable IDs and owner links encode the exact target", () => {
  const list = [{ id: "p", label: "First", state: "draft" }, { id: "p2", label: "p", state: "draft" }];
  assert.equal(searchSummaries(list, "p")[0].id, "p");
  assert.equal(ownerHref("products", "a?b"), "/admin/products?edit=a%3Fb");
  assert.equal(ownerHref("products", "a/b"), "");
  assert.equal(ownerHref("payments", "p"), "");
});
test("unknown outcome reconciles committed, confirmed noncommit and unresolved separately", async () => {
  const run = value => reconcileUnknown({ read: async () => value, committed: v => v === "yes", notCommitted: v => v === "no" });
  assert.equal((await run("yes")).state, "committed");
  assert.equal((await run("no")).state, "not-committed");
  assert.equal((await run("pending")).state, "unresolved");
  assert.equal((await reconcileUnknown({ read: async () => { throw Error("timeout"); }, committed: () => true, notCommitted: () => true })).state, "unresolved");
  assert.equal(resultState({ code: "permission-denied" }), "restricted");
  assert.equal(resultState({ code: "deadline-exceeded" }), "connection-problem");
});
test("REST policy decoder retains explicit scoped grants without role fallback", () => {
  const fields = { staffId: { stringValue: "s" }, active: { booleanValue: true }, capabilities: { mapValue: { fields: {
    "media.upload": { mapValue: { fields: { domainWide: { mapValue: { fields: { active: { booleanValue: true }, purpose: { stringValue: "public-media" } } } } } } },
  } } } };
  assert.equal(allows(firestoreFields(fields), "media.upload", { purpose: "public-media" }), true);
});
test("operation recovery survives reopening and is isolated by actor and source", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  beginStaffOperation("actor-a", "products", "operation-1", storage);
  assert.equal(pendingStaffOperation("actor-a", "products", storage).operationId, "operation-1");
  assert.equal(pendingStaffOperation("actor-b", "products", storage), null);
  assert.equal(pendingStaffOperation("actor-a", "heroSlides", storage), null);
  clearStaffOperation("actor-a", "products", "different-operation", storage);
  assert.ok(pendingStaffOperation("actor-a", "products", storage));
  clearStaffOperation("actor-a", "products", "operation-1", storage);
  assert.equal(pendingStaffOperation("actor-a", "products", storage), null);
  assert.throws(() => beginStaffOperation("actor-a", "products", "op", null), /cannot retain/);
});
