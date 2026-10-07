import { canDiscover, staffFingerprint } from "./staffAuthorization.js";

export const SEARCH_DOMAINS = ["customers", "orders", "payments", "chats", "customStyle", "products", "reviews"];
const aliases = { customer: "customers", customers: "customers", order: "orders", orders: "orders", extension: "orders", extensions: "orders", payment: "payments", payments: "payments", chat: "chats", chats: "chats", conversation: "chats", product: "products", products: "products", review: "reviews", reviews: "reviews", "dicta moment": "reviews", "custom style": "customStyle" };
export function searchDomains(staff) { return SEARCH_DOMAINS.filter(domain => canDiscover(staff, domain)); }
const queryHandoffs = new Map();
export function searchActor(uid, staff) { return uid + "/" + staffFingerprint(staff); }
export function createSearchHandoff(actor, query) {
  const handle = crypto.randomUUID();
  queryHandoffs.set(handle, { actor, query: String(query || "").slice(0, 200) });
  while (queryHandoffs.size > 10) queryHandoffs.delete(queryHandoffs.keys().next().value);
  return handle;
}
export function searchHandoffQuery(actor, handle) {
  const handoff = queryHandoffs.get(handle);
  return handoff?.actor === actor ? handoff.query : "";
}

// Deliberately bounded, deterministic language support. No query leaves the
// existing owner read path and no interpretation creates business authority.
export function interpretSearch(value) {
  const query = String(value || "").trim().slice(0, 200);
  const command = query.match(/^open\s+(dashboard|attention|search)$/i);
  if (command) return { kind: "navigation", destination: command[1].toLowerCase(), query };
  const exact = query.match(/^open\s+(customer|order|extension|payment|chat|conversation|product|review|custom style|dicta moment)\s+([^\s/]+)$/i);
  if (exact) return { kind: "exact", domain: aliases[exact[1].toLowerCase()], reference: exact[2], query };
  const entity = query.match(/^(?:find\s+|show\s+)?(customers?|orders?|extensions?|payments?|chats?|conversations?|products?|reviews?|custom style|dicta moments?)\b\s*(.*)$/i);
  const domain = entity ? aliases[entity[1].toLowerCase().replace(/moments$/, "moment").replace(/conversations$/, "conversation")] : null;
  let term = entity ? entity[2].replace(/^(?:named|called|matching)\s+/i, "") : query;
  const waiting = domain === "chats" && /^(?:waiting on staff|awaiting (?:a )?reply|needing (?:a )?reply)$/i.test(term);
  if (waiting) term = "";
  return { kind: "find", domain, term, needsAction: waiting, query };
}
export function searchMatches(items, interpretation, category = "all") {
  if (interpretation.kind !== "find") return [];
  const needle = interpretation.term.toLocaleLowerCase();
  return items.filter(item => item && (category === "all" || item.domain === category)
    && (!interpretation.domain || item.domain === interpretation.domain)
    && (!interpretation.needsAction || item.needsAction)
    && `${item.label} ${item.state} ${item.reference || ""}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => Number(b.reference?.toLocaleLowerCase() === needle) - Number(a.reference?.toLocaleLowerCase() === needle) || a.label.localeCompare(b.label));
}
const recentPrefix = "udc:recent-entities:";
function storageOrNull() { try { return sessionStorage; } catch { return null; } }
export function recentEntityReferences(actor, storage = storageOrNull()) {
  try {
    const values = JSON.parse(storage?.getItem(recentPrefix + actor) || "[]");
    return Array.isArray(values) ? values.filter(item => SEARCH_DOMAINS.includes(item.domain) && typeof item.id === "string" && item.id.length <= 200 && !item.id.includes("/")).slice(0, 5) : [];
  } catch { return []; }
}
export function rememberEntity(actor, item, storage = storageOrNull()) {
  if (!actor || !SEARCH_DOMAINS.includes(item?.domain) || !item.id || item.id.includes("/")) return;
  const values = [{ domain: item.domain, id: item.id }, ...recentEntityReferences(actor, storage).filter(entry => entry.domain !== item.domain || entry.id !== item.id)].slice(0, 5);
  // Store handles only: never names, contact, previews, query history or rights.
  try { storage?.setItem(recentPrefix + actor, JSON.stringify(values)); } catch { /* Recent entities are optional, not operational authority. */ }
}
