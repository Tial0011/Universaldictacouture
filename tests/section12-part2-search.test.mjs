import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interpretSearch, searchMatches, searchDomains, rememberEntity, recentEntityReferences, searchActor, createSearchHandoff, searchHandoffQuery } from "../src/services/operationalSearch.js";
import { operationalSummary } from "../src/services/operationsModel.js";
import { studioStaff, route } from "./staff-fixtures.mjs";
test("language search remains bounded and does not execute consequential verbs", () => {
  assert.deepEqual(interpretSearch("find products named Aso"), { kind: "find", domain: "products", term: "Aso", needsAction: false, query: "find products named Aso" });
  assert.equal(interpretSearch("chats waiting on staff").needsAction, true);
  assert.equal(interpretSearch("open product piece-123").reference, "piece-123");
  assert.equal(interpretSearch("open attention").kind, "navigation");
  for (const text of ["verify payment p1", "assign chat c1", "delete customer c1", "publish product p1"]) assert.equal(interpretSearch(text).kind, "find");
  assert.equal(interpretSearch("open product ../../secret").kind, "find");
});
test("entity discovery reveals only independently authorized domains", () => {
  assert.deepEqual(searchDomains({ ...studioStaff(), capabilities: { "customers.read": route("customer-support") } }), ["customers"]);
  assert.deepEqual(searchDomains({ active: true, staffId: "s", role: "Super Admin", functionAsCouturier: true }), []);
  assert.equal(searchDomains(studioStaff()).includes("payments"), false);
});
test("search masking omits raw IDs, private content and unrelated entities from previews", () => {
  const chat = operationalSummary("chats", { id: "private-uid", customerEmail: "secret@test", lastMessage: "secret", lastSenderRole: "customer" });
  const product = operationalSummary("products", { id: "p", name: "Aso atelier", status: "draft" });
  assert.equal(chat.label.includes("private-uid"), false);
  assert.equal(chat.reference, undefined);
  assert.deepEqual(searchMatches([chat, product], interpretSearch("private-uid")), []);
  assert.deepEqual(searchMatches([chat, product], interpretSearch("chats waiting on staff")), [chat]);
  assert.deepEqual(searchMatches([chat, product], interpretSearch("find products named Aso")), [product]);
  assert.deepEqual(searchMatches([chat, product], interpretSearch("Aso"), "chats"), []);
});
test("recent entities retain only five actor-bound handles, not queries or PII", () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  for (let i = 0; i < 7; i++) rememberEntity("a/staff-a", { id: "p" + i, domain: "products", label: "private name", query: "private query" }, storage);
  assert.equal(recentEntityReferences("a/staff-a", storage).length, 5);
  assert.deepEqual(recentEntityReferences("b/staff-b", storage), []);
  assert.equal([...map.values()].some(value => value.includes("private")), false);
  rememberEntity("a/staff-a", { id: "p6", domain: "products" }, storage);
  assert.equal(recentEntityReferences("a/staff-a", storage).filter(item => item.id === "p6").length, 1);
  rememberEntity("a/staff-a", { id: "a/b", domain: "customers" }, storage);
  assert.equal(recentEntityReferences("a/staff-a", storage)[0].id, "p6");
});
test("shell query handoff is memory-only and cannot flash into a different account or access revision", () => {
  const staff = studioStaff();
  const actor = searchActor("account-a", staff);
  const handle = createSearchHandoff(actor, "private support query");
  assert.equal(handle.includes("private"), false);
  assert.equal(searchHandoffQuery(actor, handle), "private support query");
  assert.equal(searchHandoffQuery(searchActor("account-b", staff), handle), "");
  assert.equal(searchHandoffQuery(searchActor("account-a", { ...staff, active: false }), handle), "");
});
test("Search and General Chat use bounded server projections and no private broad previews", () => {
  const chat = readFileSync(new URL("../src/services/chats.js", import.meta.url), "utf8");
  assert.match(chat, /return loadOperationalPage\("chats", cursor\)/);
  assert.match(chat, /admin \? getDocsFromServer/);
  assert.match(chat, /beginStaffOperation\(actor, sendKind\(customerId\), message.id\)/);
  const ui = readFileSync(new URL("../src/pages/admin/Operations/GlobalSearch.jsx", import.meta.url), "utf8");
  assert.match(ui, /readOperationalRecord\(item.domain, item.id\)/);
  assert.match(ui, /resolveOperationalOpen\(safeContextCapsule\(\{ domain, id \}\), readOperationalRecord\)/);
  assert.match(ui, /Some owner sources are unavailable or restricted/);
  assert.doesNotMatch(ui, /setSearchParams|setParams/);
});
test("the Part-2 register accounts for exactly 115 official flows without claiming external work complete", () => {
  const register = JSON.parse(readFileSync(new URL("../docs/section12-part2-coverage.json", import.meta.url), "utf8"));
  assert.equal(register.verdict, "PARTIAL");
  assert.deepEqual(register.modules.map(module => module.flowCount), [25, 25, 22, 21, 22]);
  const flows = register.modules.flatMap(module => module.flows);
  assert.equal(flows.length, 115);
  assert.equal(new Set(flows.map(flow => flow.id)).size, 115);
  assert.equal(flows.filter(flow => flow.disposition === "EXTERNAL OWNER DEPENDENCY").length, 78);
  assert.ok(flows.every(flow => flow.reason && flow.evidence.length && (flow.disposition !== "EXTERNAL OWNER DEPENDENCY" || flow.owner)));
  for (const module of register.modules) assert.deepEqual(module.flows.map(flow => flow.id), Array.from({ length: module.flowCount }, (_, index) => `S12-M${String(module.module).padStart(2, "0")}-F${String(index + 1).padStart(2, "0")}`));
});
