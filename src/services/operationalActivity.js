import { authorizationRoutes, allows, canDiscover, safeOperationalId } from "./staffAuthorization.js";
import { milliseconds, ownerHref } from "./operationsModel.js";
export const ACTIVITY_ACTIONS = ["unpublish", "archive", "restore"];
function scopes(staff, domain, purpose, chunk = 20) {
  const routes = authorizationRoutes(staff, domain + ".read", purpose);
  if (routes.some(route => route.family === "domainWide")) return [null];
  const ids = [...new Set(routes.filter(route => route.family === "selectedObject").flatMap(route => route.ids || []))].filter(safeOperationalId);
  return Array.from({ length: Math.ceil(ids.length / chunk) }, (_, i) => ids.slice(i * chunk, (i + 1) * chunk));
}
export function canViewTeamActivity(staff) {
  return ["audit", "products"].every(domain => authorizationRoutes(staff, domain + ".read", domain === "audit" ? "audit" : "catalogue").some(route => route.family === "domainWide"));
}
export function activityPlans(staff, view = "mine") {
  if (!["mine", "team"].includes(view) || !canDiscover(staff, "audit") || !canDiscover(staff, "products") || (view === "team" && !canViewTeamActivity(staff))) return [];
  return scopes(staff, "audit", "audit", 1).flatMap(auditIds => scopes(staff, "products", "catalogue").flatMap(targetIds => ACTIVITY_ACTIONS.map(action => ({ action, auditId: auditIds?.[0] || null, targetIds, actorStaffId: view === "mine" ? staff.staffId : null }))));
}
export function activityEvent(staff, record) {
  if (!safeOperationalId(record.id) || !safeOperationalId(record.targetId) || record.targetCollection !== "products" || !ACTIVITY_ACTIONS.includes(record.action) || record.outcome !== "committed" || record.execution !== "staff" || typeof record.actorStaffId !== "string" || !record.actorStaffId || !milliseconds(record.createdAt)
    || !allows(staff, "audit.read", { purpose: "audit", objectId: record.id }) || !allows(staff, "products.read", { purpose: "catalogue", objectId: record.targetId })) return null;
  return { id: record.id, domain: "products", objectId: record.targetId, summary: { unpublish: "Product unpublished", archive: "Product archived", restore: "Product restored to Unpublished" }[record.action],
    actor: record.actorStaffId === staff.staffId ? "You (Staff)" : "Staff actor · name unavailable", actorStaffId: record.actorStaffId, occurredAt: milliseconds(record.createdAt), href: ownerHref("products", record.targetId) };
}
export function relativeEventTime(timestamp, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
