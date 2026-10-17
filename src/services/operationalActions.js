import { safeOperationalId } from "./staffAuthorization.js";
export const ACTION_SAFETY_MANIFEST = Object.freeze({
  open: { risk: "navigation-only", mutation: false, currentOwnerRequired: true },
  acknowledge: { risk: "low-risk-triage", mutation: true, delegatedOwnerRequired: true },
  claim: { risk: "consequential", mutation: true, delegatedOwnerRequired: true, concurrencyRequired: true },
  assign: { risk: "consequential", mutation: true, delegatedOwnerRequired: true, concurrencyRequired: true },
  reassign: { risk: "consequential", mutation: true, delegatedOwnerRequired: true, concurrencyRequired: true },
  escalate: { risk: "consequential", mutation: true, delegatedOwnerRequired: true, reconciliationRequired: true },
  protectedOwnerAction: { risk: "highly-protected", mutation: true, ownerWorkflowOnly: true },
});
export function safeContextCapsule(item, { attention = false, issue = null } = {}) {
  if (!["products", "reviews", "chats", "orders"].includes(item?.domain) || !safeOperationalId(item.id)) throw Object.assign(new Error("Cannot open this context."), { code: "permission-denied" });
  return { domain: item.domain, id: item.id, attention: attention === true, ...(item.domain === "products" && ["name", "price", "image", "category", "identity", "unit"].includes(issue) ? { issue } : {}) };
}
export async function resolveOperationalOpen(capsule, read) {
  if (typeof read !== "function") throw Object.assign(new Error("An authoritative reader is required."), { code: "source-unavailable" });
  const context = safeContextCapsule(capsule, capsule);
  const current = await read(context.domain, context.id);
  if (!current) return { state: "unavailable" };
  if (current.id !== context.id || current.domain !== context.domain || !current.href) throw Object.assign(new Error("Exact owner context could not be verified."), { code: "source-unavailable" });
  if (context.attention && !current.needsAction) return { state: "resolved-elsewhere", current };
  const issueChanged = Boolean(context.issue && !current.issueKeys?.includes(context.issue));
  return { state: issueChanged ? "changed" : "current", current,
    href: current.href + (context.issue ? `&issue=${encodeURIComponent(context.issue)}` : "") };
}
