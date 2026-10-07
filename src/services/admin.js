import { collection, deleteDoc, doc, getCountFromServer, getDocFromServer, getDocsFromServer, onSnapshot, query, orderBy, documentId, limit, startAfter, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { allows, currentStaff, safeOperationalId, normalizeStaffMembership, staffMembershipState } from "./staffAuthorization";
import { ownsCommittedReceipt, protectedWriteDeadline, currentReadDeadline } from "./operationalRuntime";
import { loadScopedOwnerPage, readCurrentStaff } from "./operations";
import { milliseconds, reconcileUnknown } from "./operationsModel";
import { beginStaffOperation, clearStaffOperation, pendingStaffOperation, staffOperationActor } from "./staffOperations";
import { db } from "../firebase/firestore";
import { prepareRecord } from "./adminModel";
const COLLECTIONS = new Set(["products", "heroSlides", "reviews", "discoveryModules", "taxonomy"]);
export const PAGE_SIZE = 20;
function target(kind) {
  if (!db) throw new Error("Connect Firebase before managing content.");
  if (!COLLECTIONS.has(kind)) throw new Error("Unknown content section.");
  return collection(db, kind);
}
export async function checkAdmin(uid) {
  if (!db) return false;
  const snapshot = await getDocFromServer(doc(db, "admins", uid));
  return snapshot.exists() && currentStaff(normalizeStaffMembership(uid, snapshot.data()));
}
export function watchStaffAccess(uid, next, error) {
  if (!db) { next(null); return () => {}; }
  const reference = doc(db, "admins", uid);
  let live = true;
  let generation = 0;
  const publishMembership = snapshot => {
    const raw = snapshot.exists() ? snapshot.data() : null;
    next(normalizeStaffMembership(uid, raw), "verified", staffMembershipState(uid, raw));
  };
  const refresh = () => {
    const version = ++generation;
    return getDocFromServer(reference).then(snapshot => {
      if (live && generation === version) publishMembership(snapshot);
    }).catch(reason => { if (live && generation === version) error(reason); });
  };
  const stop = onSnapshot(reference, { includeMetadataChanges: true }, snapshot => {
    // Cached membership is never a current authorization handoff.
    if (live) { generation++; if (snapshot.metadata.fromCache) next(null, "checking"); else publishMembership(snapshot); }
  }, error);
  const visibility = () => { if (document.visibilityState === "visible") { next(null, "checking"); void refresh(); } };
  const pageRestore = event => { if (event.persisted) visibility(); };
  const offline = () => { generation++; next(null, "connection-problem"); };
  window.addEventListener("online", visibility);
  window.addEventListener("offline", offline);
  window.addEventListener("pageshow", pageRestore);
  document.addEventListener("visibilitychange", visibility);
  void refresh();
  return () => { live = false; stop(); window.removeEventListener("online", visibility); window.removeEventListener("offline", offline); window.removeEventListener("pageshow", pageRestore); document.removeEventListener("visibilitychange", visibility); };
}
export async function loadAdminRecord(kind, id) {
  if (!id || id.includes("/")) throw new Error("Choose a valid record reference.");
  if (kind === "products" || kind === "reviews") {
    const staff = await readCurrentStaff();
    if (!allows(staff, kind + ".read", { purpose: kind === "products" ? "catalogue" : "moderation", objectId: id })) throw Object.assign(new Error("Current record access is unavailable."), { code: "permission-denied" });
  }
  const snapshot = await currentReadDeadline(getDocFromServer(doc(target(kind), id)));
  return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
}
export async function reconcileAdminOperation(operationId) {
  const staff = await readCurrentStaff();
  if (!safeOperationalId(operationId)) return { state: "unresolved" };
  const receipt = await currentReadDeadline(getDocFromServer(doc(db, "staffAudit", operationId)));
  if (!receipt.exists()) return { state: "unresolved" };
  const result = receipt.data();
  const actor = staffOperationActor(staff.principalUid, staff.staffId);
  if (!COLLECTIONS.has(result.targetCollection) || !safeOperationalId(result.targetId)
    || !ownsCommittedReceipt(result, staff, operationId, pendingStaffOperation(actor, result.targetCollection))) return { state: "unresolved" };
  clearStaffOperation(staffOperationActor(staff.principalUid, staff.staffId), result.targetCollection, operationId);
  return { state: "committed", kind: result.targetCollection, id: result.targetId };
}
export async function loadAdminPage(kind, cursor = null) {
  if (kind === "products" || kind === "reviews") return loadScopedOwnerPage(kind, cursor);
  const constraints = [orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE)];
  const snapshot = await getDocsFromServer(query(target(kind), ...constraints));
  return { records: snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id })), cursor: snapshot.docs.at(-1) || null, hasMore: snapshot.size === PAGE_SIZE };
}

export async function loadProductStatusCounts() {
  if (!db) throw new Error("Connect Firebase before managing content.");
  const statuses = ["draft", "published", "unpublished", "archived"];
  const counts = await Promise.all(statuses.map(async (status) => {
    const snapshot = await getCountFromServer(query(target("products"), where("status", "==", status)));
    return [status, snapshot.data().count];
  }));
  return Object.fromEntries(counts);
}

export async function saveAdminRecord(kind, raw, { action = "save" } = {}) {
  if (kind === "reviews") throw new Error("Review mutations require the protected consent/version owner workflow.");
  if (kind === "products" && raw.status === "published") throw new Error("Publish and Update Live require the protected Working/Live and current-readiness owner workflow. No live change has been made.");
  const data = kind === "products" && action !== "save" ? { status: raw.status, archived: raw.status === "archived" } : prepareRecord(kind, raw);
  const reference = raw.id ? doc(target(kind), raw.id) : doc(target(kind));
  const staff = await readCurrentStaff();
  const actorKey = staffOperationActor(staff.principalUid, staff.staffId);
  const pending = pendingStaffOperation(actorKey, kind);
  if (pending) throw Object.assign(new Error("An earlier save requires authoritative reconciliation before another save can start."), { code: "outcome-unknown", operationId: pending.operationId });
  const domain = kind === "products" ? "products" : "content";
  const purpose = domain === "products" ? "catalogue" : "content";
  const required = kind !== "products" ? ["content.edit"] : action !== "save" ? [{ unpublish: "products.unpublish", archive: "products.archive", restore: "products.restore" }[action]]
    : !raw.id ? ["products.create"] : ["products.edit", "products.commercial", "products.media", "products.discovery"];
  const authorized = current => required.some(capability => capability && allows(current, capability, { purpose, objectId: reference.id }));
  if (!authorized(staff)) throw Object.assign(new Error("Current action authority is unavailable."), { code: "permission-denied" });
  const receipt = doc(collection(db, "staffAudit"));
  if (!allows(staff, "operations.reconcile", { purpose: "operation-result", objectId: receipt.id }) && !allows(staff, "audit.read", { purpose: "audit", objectId: receipt.id })) throw Object.assign(new Error("Current operation-result authority is required before this save can start."), { code: "permission-denied" });
  beginStaffOperation(actorKey, kind, receipt.id);
  try {
    await protectedWriteDeadline(runTransaction(db, async transaction => {
      const membership = await transaction.get(doc(db, "admins", staff.principalUid));
      const current = await transaction.get(reference);
      const currentData = current.data() || {};
      const currentMembership = normalizeStaffMembership(staff.principalUid, membership.exists() ? membership.data() : null);
      if (!authorized(currentMembership) || currentMembership.staffId !== staff.staffId) throw Object.assign(new Error("Access changed."), { code: "permission-denied" });
      if (raw.id && (!current.exists() || (raw._version || 0) !== (currentData._version || 0) || milliseconds(raw.updatedAt) !== milliseconds(currentData.updatedAt))) throw Object.assign(new Error("This record changed elsewhere. Refresh and review current state before saving."), { code: "aborted" });
      const next = { ...data, _version: (currentData._version || 0) + 1, _lastOperationId: receipt.id, updatedAt: serverTimestamp() };
      if (!current.exists()) next.createdAt = serverTimestamp();
      if (kind === "products") {
        const firstPublication = currentData.publishedAt || currentData.firstPublishedAt;
        // Preserve existing evidence; ordinary saves cannot mint a publication
        // timestamp or normalize a historical alias into a new event.
        if (firstPublication && currentData.publishedAt) next.publishedAt = currentData.publishedAt;
        else delete next.publishedAt;
        if (!current.exists()) delete next.firstPublishedAt;
      }
      transaction.set(reference, next, { merge: true });
      transaction.set(receipt, { actorUid: staff.principalUid, actorStaffId: staff.staffId, execution: "staff", targetCollection: kind,
        targetId: reference.id, action, outcome: "committed", createdAt: serverTimestamp() });
    }));
    const confirmation = await currentReadDeadline(getDocFromServer(receipt));
    if (!confirmation.exists() || !ownsCommittedReceipt(confirmation.data(), staff, receipt.id, pendingStaffOperation(actorKey, kind))
      || confirmation.data().targetCollection !== kind || confirmation.data().targetId !== reference.id || confirmation.data().action !== action) throw Object.assign(new Error("The result could not be confirmed."), { code: "outcome-unknown" });
  } catch (error) {
    const knownRejection = ["permission-denied", "aborted", "invalid-argument", "failed-precondition"].includes(error.code);
    const result = await reconcileUnknown({ read: () => currentReadDeadline(getDocFromServer(receipt)), committed: snapshot => snapshot.exists() && ownsCommittedReceipt(snapshot.data(), staff, receipt.id, pendingStaffOperation(actorKey, kind)) && snapshot.data().targetCollection === kind && snapshot.data().targetId === reference.id && snapshot.data().action === action, notCommitted: snapshot => !snapshot.exists() && knownRejection });
    if (result.state === "not-committed") { clearStaffOperation(actorKey, kind, receipt.id); throw error; }
    if (result.state !== "committed") throw Object.assign(new Error("The save outcome is unknown. Refresh authoritative state before trying again."), { code: "outcome-unknown", operationId: receipt.id });
  }
  clearStaffOperation(actorKey, kind, receipt.id);
  return reference.id;
}

export async function deleteAdminRecord(kind, id) {
  if (!["products", "reviews", "heroSlides"].includes(kind)) throw new Error("Deletion is not available for this content section.");
  if (!id) throw new Error("Choose a record to delete.");
  await deleteDoc(doc(target(kind), id));
}

export async function deleteProductPermanently(_record) {
  throw new Error("Product deletion requires current historical-reference and media-retention eligibility from the Product owner.");
}

export function adminError(error) {
  if (error?.code === "outcome-unknown" || error?.code === "aborted") return error.message;
  if (error?.code === "permission-denied") return "Access was denied. Check your admin access and the published Firestore rules.";
  if (error?.code === "resource-exhausted") return "The database usage limit has been reached. Please try again later.";
  if (error?.code === "unavailable") return "Unable to reach the database. Check your connection and try again.";
  if (error?.code) return "The request could not be completed. Please try again.";
  return error?.message || "Something went wrong. Please try again.";
}
