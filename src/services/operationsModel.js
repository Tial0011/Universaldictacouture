import { allows, canDiscover, DOMAIN_CONTRACTS } from "./staffAuthorization.js";
import { productReadiness } from "./adminModel.js";
import { runtimeErrorState } from "./operationalRuntime.js";

export function milliseconds(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const number = new Date(value || 0).getTime();
  return Number.isFinite(number) ? number : 0;
}
export function ownerHref(domain, id) {
  if (!id || id.includes("/")) return "";
  if (domain === "products") return `/admin/products?edit=${encodeURIComponent(id)}`;
  if (domain === "chats") return `/admin/chats?conversation=${encodeURIComponent(id)}`;
  // The safe operational detail is read-only until a compliant Review owner
  // action workflow exists; it never silently invokes the legacy editor.
  if (domain === "reviews") return `/admin/reviews?record=${encodeURIComponent(id)}`;
  return "";
}
export function operationalSummary(domain, record) {
  const id = record.id;
  if (domain === "audit") return { id, domain, label: `${record.action} · ${record.targetCollection}/${record.targetId}`,
    state: record.outcome, needsAction: false, actorStaffId: record.actorStaffId, execution: record.execution,
    updatedAt: milliseconds(record.createdAt), href: "" };
  if (domain === "products") {
    const readiness = productReadiness(record);
    const lifecycle = { draft: "Draft", unpublished: "Unpublished", published: "Published", archived: "Archived" }[record.status] || "Publication state unavailable";
    return { id, domain, label: record.name || "Product", state: lifecycle, issueState: readiness.label,
      needsAction: record.status !== "archived" && !readiness.ready,
      issueKeys: record.status === "archived" ? [] : readiness.blockers.map(item => item.key),
      reason: readiness.blockers.map(item => item.label).join(", "),
      updatedAt: milliseconds(record.updatedAt), href: ownerHref(domain, id) };
  }
  if (domain === "reviews") return { id, domain, label: "Review",
    state: ({ pending: "In review", "in-review": "In review", approved: "Approved", "needs-changes": "Needs changes", removed: "Removed" })[record.status] || record.status || "Moderation state unavailable",
    needsAction: ["pending", "in-review"].includes(record.status), reason: ["pending", "in-review"].includes(record.status) ? "Review requires owner moderation" : "",
    updatedAt: milliseconds(record.updatedAt), href: ownerHref(domain, id) };
  if (domain === "chats") return { id, domain, label: "General assistance conversation",
    state: record.lastSenderRole === "customer" ? "Needs action" : "In progress",
    needsAction: record.lastSenderRole === "customer", reason: "Customer is awaiting a reply",
    updatedAt: milliseconds(record.updatedAt), assignedStaffId: record.assignedStaffId ?? null, href: ownerHref(domain, id) };
  return null;
}
export function attentionItems(summaries) {
  const unique = new Map();
  for (const item of summaries) if (item?.needsAction) {
    const key = `${item.domain}:${item.id}`;
    // The source does not persist action-needed start time or priority. Never
    // fabricate urgency or measure attention age using ordinary object age.
    unique.set(key, { ...item, key, ownerState: item.state, state: "Needs action", priority: null, attentionSince: null });
  }
  return [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.key.localeCompare(b.key));
}
export function searchSummaries(summaries, query) {
  const needle = String(query || "").trim().toLocaleLowerCase();
  if (!needle) return [];
  return summaries.filter(item => item && `${item.id} ${item.label} ${item.state}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => Number(b.id.toLocaleLowerCase() === needle) - Number(a.id.toLocaleLowerCase() === needle) || a.label.localeCompare(b.label));
}
export function availableSources(staff) {
  return ["products", "reviews", "chats"].filter(domain => canDiscover(staff, domain));
}
export function authorizeSummary(staff, domain, record) {
  return allows(staff, `${domain}.read`, { purpose: DOMAIN_CONTRACTS[domain]?.purpose, objectId: record.id, assignedStaffId: record.assignedStaffId });
}
export function resultState(error) {
  return runtimeErrorState(error);
}
export async function reconcileUnknown({ read, committed, notCommitted }) {
  try {
    const current = await read();
    if (committed(current)) return { state: "committed", current };
    if (notCommitted(current)) return { state: "not-committed", current };
    return { state: "unresolved" };
  } catch { return { state: "unresolved" }; }
}
export function operationalMetrics(staff, sources, domains) {
  const eligible = domains.filter(domain => canDiscover(staff, domain));
  const metric = (key, label, sourceDomains, predicate, href) => {
    const ready = sourceDomains.filter(domain => ["success", "empty"].includes(sources[domain]?.state));
    const count = ready.reduce((sum, domain) => sum + (sources[domain].items || []).filter(item => authorizeSummary(staff, domain, item)).filter(predicate).length, 0);
    const pending = sourceDomains.some(domain => !sources[domain] || sources[domain].state === "initial-loading");
    const state = !ready.length ? (pending ? "loading" : "unavailable") : ready.length !== sourceDomains.length || sourceDomains.some(domain => sources[domain]?.hasMore) ? "partial" : "checked";
    return { key, label, count: ready.length ? count : null, state, href, checkedAt: ready.length ? Math.min(...ready.map(domain => sources[domain].refreshedAt)) : null };
  };
  const result = eligible.length ? [metric("attention", "Needs Attention", eligible, item => item.needsAction, "/admin/attention")] : [];
  for (const [domain, label] of [["products", "Product Issues"], ["reviews", "Reviews to Moderate"], ["chats", "Chats waiting on Staff"]]) if (eligible.includes(domain)) result.push(metric(domain, label, [domain], item => item.needsAction, `/admin/attention?source=${domain}`));
  return result;
}
