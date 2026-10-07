import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { operationalSummary, operationalMetrics } from "../src/services/operationsModel.js";
import { activityPlans, activityEvent, canViewTeamActivity, relativeEventTime } from "../src/services/operationalActivity.js";
import { ACTION_SAFETY_MANIFEST, safeContextCapsule, resolveOperationalOpen } from "../src/services/operationalActions.js";
import { safeOperationalId } from "../src/services/staffAuthorization.js";
import { studioStaff, route } from "./staff-fixtures.mjs";
const product = (extra = {}) => ({ id: "p1", name: "Atelier", status: "draft", price: 20000, unitLabel: "per piece", category: ["Aso Oke"], primaryImage: { url: "/public.webp" }, ...extra });
test("publication truth remains independent of catalogue issue/readiness", () => {
  const summary = operationalSummary("products", product({ status: "published", unitLabel: "" }));
  assert.equal(summary.state, "Published"); assert.equal(summary.needsAction, true); assert.ok(summary.issueKeys.includes("unit"));
  assert.equal(operationalSummary("products", product()).needsAction, false);
  assert.equal(operationalSummary("products", product({ status: "unpublished" })).state, "Unpublished");
  assert.equal(operationalSummary("products", product({ status: "archived", unitLabel: "" })).needsAction, false);
});
test("unavailable Review source values never manufacture pending moderation", () => {
  assert.equal(operationalSummary("reviews", { id: "r" }).state, "Moderation state unavailable");
  assert.equal(operationalSummary("reviews", { id: "r", status: "pending" }).state, "In review");
  assert.equal(operationalSummary("reviews", { id: "r", status: "removed" }).needsAction, false);
});
test("metric failure is not zero and a partial page is not a whole-domain count", () => {
  const staff = studioStaff();
  const failed = operationalMetrics(staff, { products: { state: "source-unavailable" } }, ["products"]);
  assert.equal(failed[0].count, null); assert.equal(failed[0].state, "unavailable");
  const loaded = operationalMetrics(staff, { products: { state: "empty", items: [], hasMore: false, refreshedAt: 10 } }, ["products"]);
  assert.equal(loaded[0].count, 0); assert.equal(loaded[0].state, "checked");
  const partial = operationalMetrics(staff, { products: { state: "success", items: [operationalSummary("products", product({ unitLabel: "" }))], hasMore: true, refreshedAt: 10 }, reviews: { state: "source-unavailable" } }, ["products", "reviews"]);
  assert.equal(partial[0].count, 1); assert.equal(partial[0].state, "partial");
  assert.ok(partial.every(metric => !metric.label.includes("Unread")));
});
test("metric disclosure rechecks exact object scope, not merely domain visibility", () => {
  const staff = { active: true, staffId: "narrow", capabilities: { "products.read": { selectedObject: { active: true, purpose: "catalogue", ids: ["p1"] } } } };
  const sources = { products: { state: "success", refreshedAt: 10, items: [operationalSummary("products", product({ unitLabel: "" })), operationalSummary("products", product({ id: "hidden", unitLabel: "" }))] } };
  assert.equal(operationalMetrics(staff, sources, ["products", "payments"])[0].count, 1);
  assert.equal(operationalMetrics({ active: true, staffId: "s", role: "Super Admin" }, sources, ["products"]).length, 0);
});
test("safe handoff contains no private payload or carried authority", () => {
  const context = safeContextCapsule({ domain: "products", id: "p", label: "private", capability: "all", measurements: [1], media: "private" }, { attention: true, issue: "unit" });
  assert.deepEqual(context, { domain: "products", id: "p", attention: true, issue: "unit" });
  for (const id of ["a/b", "a\\b", "a\n", "", "a".repeat(201)]) { assert.equal(safeOperationalId(id), false); assert.throws(() => safeContextCapsule({ domain: "products", id })); }
  assert.equal(safeOperationalId("valid-é"), true);
});
test("exact issue open reconciles changed, resolved, unavailable and denied sources without writes", async () => {
  const item = { domain: "products", id: "p", href: "/admin/products?edit=p", issueKeys: [], needsAction: false };
  assert.equal((await resolveOperationalOpen({ ...item, issue: "unit" }, async () => item)).state, "changed");
  assert.equal((await resolveOperationalOpen({ ...item, attention: true }, async () => item)).state, "resolved-elsewhere");
  assert.equal((await resolveOperationalOpen(item, async () => null)).state, "unavailable");
  await assert.rejects(resolveOperationalOpen(item, async () => { throw Error("denied"); }), /denied/);
  await assert.rejects(resolveOperationalOpen(item), /authoritative reader/);
  await assert.rejects(resolveOperationalOpen(item, async () => ({ ...item, id: "different" })), /Exact owner context/);
  assert.equal(ACTION_SAFETY_MANIFEST.open.mutation, false);
  assert.equal(ACTION_SAFETY_MANIFEST.claim.delegatedOwnerRequired, true);
  assert.equal(ACTION_SAFETY_MANIFEST.protectedOwnerAction.ownerWorkflowOnly, true);
  assert.equal(ACTION_SAFETY_MANIFEST.undo, undefined);
});
test("all 129 official Part-3 flows have defensible dispositions and no final-lock claim", () => {
  const register = JSON.parse(readFileSync(new URL("../docs/section12-part3-coverage.json", import.meta.url), "utf8"));
  assert.equal(register.verdict, "PARTIAL");
  assert.deepEqual(register.modules.map(module => module.flowCount), [21,22,23,25,38]);
  const flows = register.modules.flatMap(module => module.flows);
  assert.equal(flows.length,129); assert.equal(new Set(flows.map(flow=>flow.id)).size,129);
  assert.equal(flows.filter(flow=>flow.disposition==='EXTERNAL OWNER DEPENDENCY').length,53);
  assert.ok(flows.every(flow=>flow.reason && flow.evidence.length && (flow.disposition!=='EXTERNAL OWNER DEPENDENCY' || flow.owner)));
});
test("activity plans scope evidence, target objects and own actor before retrieval", () => {
  const staff = { active: true, staffId: "s", capabilities: { "audit.read": route("audit"), "products.read": { selectedObject: { active: true, purpose: "catalogue", ids: ["p1"] } } } };
  assert.equal(canViewTeamActivity(staff), false);
  assert.deepEqual(activityPlans(staff, "team"), []);
  assert.deepEqual(activityPlans(staff, "invalid-view"), []);
  const plans = activityPlans(staff);
  assert.equal(plans.length, 3); assert.ok(plans.every(plan => plan.actorStaffId === "s" && plan.targetIds.length === 1 && plan.targetIds[0] === "p1"));
  assert.deepEqual(activityPlans({ ...staff, capabilities: { "products.read": route("catalogue") } }), []);
});
test("activity excludes noisy edits and messages and preserves human attribution after assignment changes", () => {
  const staff = studioStaff();
  const event = { id: "event", targetCollection: "products", targetId: "p1", action: "unpublish", execution: "staff", outcome: "committed", actorStaffId: "historical-staff", createdAt: "2026-10-07T00:00:00Z" };
  assert.equal(activityEvent(staff, { ...event, action: "save" }), null);
  assert.equal(activityEvent(staff, { ...event, targetCollection: "conversations", action: "reply" }), null);
  assert.equal(activityEvent(staff, { ...event, outcome: "unknown" }), null);
  const summary = activityEvent(staff, { ...event, assignedStaffId: "new-staff", body: "secret", media: "private", actorUid: "private-principal" });
  assert.equal(summary.actorStaffId, "historical-staff");
  assert.equal(JSON.stringify(summary).includes("secret"), false); assert.equal(JSON.stringify(summary).includes("private"), false);
  assert.equal(relativeEventTime(60000, 120000), "1 minute ago");
});
test("Recent Activity retains separate Audit evidence and no private consent/publication shortcut", () => {
  const source = readFileSync(new URL("../src/pages/admin/Operations/RecentActivity.jsx", import.meta.url), "utf8");
  assert.match(source, /not record timestamps, notifications or formal Audit/);
  assert.doesNotMatch(source, /updatedAt|setDoc|deleteDoc|writeBatch/);
  const owner = readFileSync(new URL("../src/pages/admin/Operations/ReviewContext.jsx", import.meta.url), "utf8");
  assert.match(owner, /independent/);
});
