import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, startAfter, where } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { auth } from "../firebase/auth";
import { authorizationRoutes, currentStaff, DOMAIN_CONTRACTS, firestoreFields, safeOperationalId, normalizeStaffMembership } from "./staffAuthorization";
import { authorizeSummary, operationalSummary } from "./operationsModel";
import { activityPlans, activityEvent } from "./operationalActivity";
import { currentReadDeadline } from "./operationalRuntime";

export const OPERATION_PAGE_SIZE = 20;
export async function readCurrentStaff() {
  const user = auth?.currentUser;
  if (!db || !user) throw Object.assign(new Error("Current staff access is unavailable."), { code: "permission-denied" });
  const snapshot = await currentReadDeadline(getDocFromServer(doc(db, "admins", user.uid)));
  const staff = normalizeStaffMembership(user.uid, snapshot.exists() ? snapshot.data() : null);
  if (auth.currentUser?.uid !== user.uid || !currentStaff(staff)) throw Object.assign(new Error("Current staff access is unavailable."), { code: "permission-denied" });
  return { ...staff, principalUid: user.uid };
}
function plansFor(staff, domain) {
  const contract = DOMAIN_CONTRACTS[domain];
  const routes = authorizationRoutes(staff, `${domain}.read`, contract.purpose);
  if (routes.some(route => route.family === "domainWide")) return [{}];
  const plans = [];
  const ids = [...new Set(routes.filter(route => route.family === "selectedObject").flatMap(route => route.ids || []))];
  for (let i = 0; i < ids.length; i += OPERATION_PAGE_SIZE) plans.push({ ids: ids.slice(i, i + OPERATION_PAGE_SIZE) });
  if (domain === "chats" && routes.some(route => route.family === "assignmentDerived")) plans.push({ assignedStaffId: staff.staffId });
  return plans;
}
export async function loadScopedOwnerPage(domain, cursor = null) {
  const contract = DOMAIN_CONTRACTS[domain];
  if (!contract?.collection) throw Object.assign(new Error("The owner source is not available."), { code: "source-unavailable" });
  const staff = await readCurrentStaff();
  const plans = plansFor(staff, domain);
  const index = cursor?.planIndex || 0;
  if (!plans[index]) throw Object.assign(new Error("This scope is not available."), { code: "permission-denied" });
  const plan = plans[index];
  const scope = plan.ids ? [where(documentId(), "in", plan.ids)] : plan.assignedStaffId ? [where("assignedStaffId", "==", plan.assignedStaffId)] : [];
  const page = await currentReadDeadline(getDocsFromServer(query(collection(db, contract.collection), ...scope, orderBy(documentId()),
    ...(cursor?.after ? [startAfter(cursor.after)] : []), limit(OPERATION_PAGE_SIZE))));
  // Rules filter retrieval; this independent check limits presentation if
  // membership changed during the request. Never use it as backend security.
  const latest = await readCurrentStaff();
  const records = page.docs.map(entry => ({ ...entry.data(), id: entry.id }));
  const permitted = records.filter(record => authorizeSummary(latest, domain, record));
  const next = page.size === OPERATION_PAGE_SIZE ? { planIndex: index, after: page.docs.at(-1) }
    : index + 1 < plans.length ? { planIndex: index + 1, after: null } : null;
  return { records: permitted, cursor: next, hasMore: Boolean(next), refreshedAt: Date.now() };
}
export async function loadOperationalPage(domain, cursor = null) {
  const staff = await readCurrentStaff();
  const contract = DOMAIN_CONTRACTS[domain];
  if (!contract?.collection) throw Object.assign(new Error("The owner source is not available."), { code: "source-unavailable" });
  const plans = plansFor(staff, domain);
  const index = cursor?.planIndex || 0;
  const plan = plans[index];
  if (!plan) throw Object.assign(new Error("Current source scope is unavailable."), { code: "permission-denied" });
  const { endpoint, root } = restSource();
  const structuredQuery = { select: { fields: SUMMARY_FIELDS[domain].map(fieldPath => ({ fieldPath })) }, from: [{ collectionId: contract.collection }],
    orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: OPERATION_PAGE_SIZE };
  if (domain === "audit") structuredQuery.orderBy = [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }, { field: { fieldPath: "__name__" }, direction: "DESCENDING" }];
  if (plan.ids) structuredQuery.where = { fieldFilter: { field: { fieldPath: "__name__" }, op: "IN", value: { arrayValue: { values: plan.ids.map(id => ({ referenceValue: `${root}/${contract.collection}/${id}` })) } } } };
  else if (plan.assignedStaffId) structuredQuery.where = { fieldFilter: { field: { fieldPath: "assignedStaffId" }, op: "EQUAL", value: { stringValue: plan.assignedStaffId } } };
  if (cursor?.after) structuredQuery.startAt = { values: [...(domain === "audit" ? [{ timestampValue: cursor.createdAt }] : []), { referenceValue: cursor.after }], before: false };
  const rows = await restRead(endpoint + ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery }) });
  const documents = rows.filter(row => row.document).map(row => row.document);
  const latest = await readCurrentStaff();
  const items = documents.map(record => ({ ...firestoreFields(record.fields), id: record.name.split("/").at(-1) }))
    .filter(record => authorizeSummary(latest, domain, record)).map(record => operationalSummary(domain, record));
  const next = documents.length === OPERATION_PAGE_SIZE ? { planIndex: index, after: documents.at(-1).name, ...(domain === "audit" ? { createdAt: documents.at(-1).fields.createdAt.timestampValue } : {}) }
    : index + 1 < plans.length ? { planIndex: index + 1, after: null } : null;
  return { items, cursor: next, hasMore: Boolean(next), refreshedAt: Date.now() };
}
export async function readOperationalRecord(domain, id) {
  if (!safeOperationalId(id)) throw Object.assign(new Error("Invalid reference."), { code: "permission-denied" });
  const contract = DOMAIN_CONTRACTS[domain];
  if (!contract?.collection) throw Object.assign(new Error("The owner source is not available."), { code: "source-unavailable" });
  await readCurrentStaff();
  const mask = SUMMARY_FIELDS[domain].map(field => "mask.fieldPaths=" + encodeURIComponent(field)).join("&");
  const raw = await restRead(restSource().endpoint + "/" + contract.collection + "/" + encodeURIComponent(id) + "?" + mask);
  if (!raw) return null;
  const record = { ...firestoreFields(raw.fields), id };
  const current = await readCurrentStaff();
  if (!authorizeSummary(current, domain, record)) throw Object.assign(new Error("Access is no longer available."), { code: "permission-denied" });
  return operationalSummary(domain, record);
}
export async function loadActivityPage(view = "mine", cursor = null) {
  const staff = await readCurrentStaff();
  const plans = activityPlans(staff, view);
  const index = cursor?.planIndex || 0;
  const plan = plans[index];
  if (!plan) throw Object.assign(new Error("Current event source is unavailable for this scope."), { code: "source-unavailable" });
  const { endpoint, root } = restSource();
  const filter = (fieldPath, value) => ({ fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue: value } } });
  const filters = [filter("targetCollection", "products"), filter("action", plan.action), filter("outcome", "committed"), filter("execution", "staff")];
  if (plan.actorStaffId) filters.push(filter("actorStaffId", plan.actorStaffId));
  if (plan.auditId) filters.push({ fieldFilter: { field: { fieldPath: "__name__" }, op: "EQUAL", value: { referenceValue: `${root}/staffAudit/${plan.auditId}` } } });
  if (plan.targetIds) filters.push({ fieldFilter: { field: { fieldPath: "targetId" }, op: "IN", value: { arrayValue: { values: plan.targetIds.map(stringValue => ({ stringValue })) } } } });
  const structuredQuery = { select: { fields: SUMMARY_FIELDS.audit.map(fieldPath => ({ fieldPath })) }, from: [{ collectionId: "staffAudit" }], where: { compositeFilter: { op: "AND", filters } }, orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }, { field: { fieldPath: "__name__" }, direction: "DESCENDING" }], limit: OPERATION_PAGE_SIZE };
  if (cursor?.after) structuredQuery.startAt = { values: [{ timestampValue: cursor.createdAt }, { referenceValue: cursor.after }], before: false };
  const rows = await restRead(endpoint + ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery }) });
  const documents = rows.filter(row => row.document).map(row => row.document);
  const current = await readCurrentStaff();
  const items = documents.map(record => activityEvent(current, { ...firestoreFields(record.fields), id: record.name.split("/").at(-1) })).filter(Boolean);
  const next = documents.length === OPERATION_PAGE_SIZE ? { planIndex: index, after: documents.at(-1).name, createdAt: documents.at(-1).fields.createdAt.timestampValue }
    : index + 1 < plans.length ? { planIndex: index + 1, after: null } : null;
  return { items, cursor: next, hasMore: Boolean(next), refreshedAt: Date.now() };
}
const SUMMARY_FIELDS = {
  products: ["name", "status", "price", "unitLabel", "priceToken", "category", "primaryImage", "images", "updatedAt"],
  reviews: ["status", "published", "updatedAt"],
  chats: ["lastSenderRole", "updatedAt", "assignedStaffId"],
  audit: ["actorStaffId", "execution", "targetCollection", "targetId", "action", "outcome", "createdAt"],
};
function restSource() {
  const project = auth.app.options.projectId;
  const localTest = import.meta.env.DEV && import.meta.env.MODE === "section12-test" && project === "demo-udc-section12" && ["localhost", "127.0.0.1"].includes(location.hostname);
  const root = `projects/${project}/databases/(default)/documents`;
  return { root, endpoint: (localTest ? "http://127.0.0.1:8089/v1/" : "https://firestore.googleapis.com/v1/") + root };
}
async function restRead(url, options = {}) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("Current access is unavailable."), { code: "permission-denied" });
  let response;
  try {
    response = await fetch(url, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: "Bearer " + await user.getIdToken() }, signal: AbortSignal.timeout(15000) });
  } catch { throw Object.assign(new Error("The owner source could not be reached."), { code: "unavailable" }); }
  if (auth.currentUser?.uid !== user.uid) throw Object.assign(new Error("Account context changed."), { code: "permission-denied" });
  if (response.status === 404) return null;
  if (!response.ok) throw Object.assign(new Error("The owner source could not be verified."), { code: [401, 403].includes(response.status) ? "permission-denied" : "unavailable" });
  return response.json();
}
