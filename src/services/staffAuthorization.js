// Shared presentation/Netlify policy. Firestore independently enforces this contract.
export const SCOPE_FAMILIES = ["domainWide", "assignmentDerived", "selectedObject", "queueSubset", "dataPurpose", "governance"];
export const DOMAIN_CONTRACTS = {
  products: { label: "Products", purpose: "catalogue", collection: "products", path: "/admin/products" },
  reviews: { label: "Review & Feeds", purpose: "moderation", collection: "reviews", path: "/admin/reviews" },
  chats: { label: "Chats", purpose: "customer-service", collection: "conversations", path: "/admin/chats" },
  content: { label: "Website content", purpose: "content" },
  customers: { label: "Customers", purpose: "customer-support", owner: "Section 11 / Section 16" },
  orders: { label: "Orders & Extensions", purpose: "order-operations", owner: "Section 14 / Section 16" },
  payments: { label: "Payments", purpose: "payment-operations", owner: "Payment owner / Section 14 / Section 16" },
  customStyle: { label: "Custom Style", purpose: "custom-style", owner: "Custom Style owner / Section 16" },
  audit: { label: "Audit History", purpose: "audit", collection: "staffAudit", path: "/admin/audit" },
};
export function currentStaff(staff) {
  return staff?.active === true && typeof staff.staffId === "string" && staff.staffId.trim().length > 0;
}
export function safeOperationalId(id) {
  return typeof id === "string" && id.length > 0 && id.length <= 200 && !id.includes("/") && !id.includes("\\") && !Array.from(id).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}
export function authorizationRoutes(staff, capability, purpose) {
  if (!currentStaff(staff)) return [];
  const grants = staff.capabilities?.[capability];
  if (!grants || typeof grants !== "object") return [];
  return SCOPE_FAMILIES.flatMap(family => {
    const route = grants[family];
    return route?.active === true && route.purpose === purpose ? [{ ...route, family }] : [];
  });
}
export function allows(staff, capability, { purpose, objectId, assignedStaffId, queueId, dataClass, governanceArea } = {}) {
  return authorizationRoutes(staff, capability, purpose).some(route => {
    if (route.family === "domainWide") return true;
    if (route.family === "selectedObject") return typeof objectId === "string" && Array.isArray(route.ids) && route.ids.includes(objectId);
    if (route.family === "assignmentDerived") return Boolean(objectId) && assignedStaffId === staff.staffId;
    if (route.family === "queueSubset") return Boolean(queueId) && Array.isArray(route.queueIds) && route.queueIds.includes(queueId);
    if (route.family === "dataPurpose") return Boolean(objectId && dataClass) && Array.isArray(route.ids) && route.ids.includes(objectId) && Array.isArray(route.dataClasses) && route.dataClasses.includes(dataClass);
    if (route.family === "governance") return Boolean(governanceArea) && route.area === governanceArea;
    return false;
  });
}
export function canDiscover(staff, domain) {
  const contract = DOMAIN_CONTRACTS[domain];
  // Discovery is its own entitlement. Unsupported scope queries stay closed.
  return Boolean(contract && authorizationRoutes(staff, `${domain}.read`, contract.purpose).some(route =>
    route.family === "domainWide" || (route.family === "selectedObject" && Array.isArray(route.ids) && route.ids.length > 0)
    || (domain === "chats" && route.family === "assignmentDerived")));
}
export function staffFingerprint(staff) {
  return JSON.stringify([staff?.staffId, staff?.active, staff?.capabilities || {}]);
}
export function firestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}
function decode(value) {
  if ("booleanValue" in value) return value.booleanValue;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  if ("mapValue" in value) return firestoreFields(value.mapValue.fields);
  return null;
}
