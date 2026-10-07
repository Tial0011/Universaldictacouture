import { collection, doc, getDocFromServer, getDocs, getDocsFromServer, limit, onSnapshot, orderBy, query, serverTimestamp, startAfter, writeBatch } from "firebase/firestore";
import { loadOperationalPage, readCurrentStaff } from "./operations";
import { allows } from "./staffAuthorization";
import { auth } from "../firebase/auth";
import { db } from "../firebase/firestore";
import { normaliseProductContext, prepareMessage } from "./chatModel";
import { beginStaffOperation, clearStaffOperation, pendingStaffOperation, staffOperationActor } from "./staffOperations";
import { protectedWriteDeadline, currentReadDeadline } from "./operationalRuntime";
import { requireCustomerAccountAuthority } from "./customerAccountAuthority";
export const MESSAGE_PAGE_SIZE = 30;
const unresolvedSends = new Map();
function database() {
  if (!db) throw new Error("Chat is not connected yet. Please try again later.");
  return db;
}
function messagesQuery(uid, cursor) {
  return query(collection(database(), "conversations", uid, "messages"), orderBy("createdAt", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(MESSAGE_PAGE_SIZE));
}
function page(snapshot, size) {
  return { items: snapshot.docs.map(item => ({ ...item.data(), id: item.id, pending: item.metadata.hasPendingWrites })), cursor: snapshot.docs.at(-1) || null, hasMore: snapshot.size === size };
}
export function watchMessages(uid, next, error) {
  return onSnapshot(messagesQuery(uid), { includeMetadataChanges: true }, snapshot => next(page(snapshot, MESSAGE_PAGE_SIZE), snapshot.metadata.fromCache), error);
}
export async function olderMessages(uid, cursor, admin = false) {
  return page(await (admin ? getDocsFromServer(messagesQuery(uid, cursor)) : getDocs(messagesQuery(uid, cursor))), MESSAGE_PAGE_SIZE);
}
export async function listConversations(cursor) {
  return loadOperationalPage("chats", cursor);
}
function sendActor(uid, staffId) { return staffOperationActor(uid, staffId || "customer"); }
function sendKind(customerId) { return "chat:" + customerId; }
export async function hasPendingSend(uid, customerId, admin = false) {
  if (auth.currentUser?.uid !== uid) return false;
  let staffId = null;
  if (admin) staffId = (await readCurrentStaff()).staffId;
  return Boolean(pendingStaffOperation(sendActor(uid, staffId), sendKind(customerId)));
}
export function watchConversation(id, next, error) {
  return onSnapshot(doc(database(), "conversations", id), { includeMetadataChanges: true }, snapshot =>
    next(snapshot.exists() && !snapshot.metadata.fromCache ? { ...snapshot.data(), id: snapshot.id } : null), error);
}
export async function sendMessage({ user, customerId, text, admin = false, productContext = null }) {
  if (!user) throw new Error("Please sign in to send a message.");
  if (auth.currentUser?.uid !== user.uid) throw Object.assign(new Error("Current message principal changed."), { code: "permission-denied" });
  // Staff mode never creates Customer authority. Rules already deny the legacy
  // Customer path; fail before reads rather than infer an Account from UID.
  if (!admin) {
    requireCustomerAccountAuthority();
    throw Object.assign(new Error("The current customer Chat owner service is unavailable."), { code: "chat-source-unavailable" });
  }
  const body = prepareMessage(text);
  const context = normaliseProductContext(productContext);
  const store = database();
  const conversation = doc(store, "conversations", customerId);
  const existing = await getDocFromServer(conversation);
  if (!existing.exists()) throw new Error("This conversation is no longer available.");
  let staffActorId = null;
  if (admin) {
    const staff = await readCurrentStaff();
    if (staff.principalUid !== user.uid || !allows(staff, "chats.reply", { purpose: "customer-service", objectId: customerId, assignedStaffId: existing.data()?.assignedStaffId })) throw Object.assign(new Error("Current reply authority is unavailable."), { code: "permission-denied" });
    staffActorId = staff.staffId;
  }
  const message = doc(collection(conversation, "messages"));
  const operationKey = user.uid + "/" + (staffActorId || "customer") + "/" + customerId;
  const actor = sendActor(user.uid, staffActorId);
  if (unresolvedSends.has(operationKey) || pendingStaffOperation(actor, sendKind(customerId))) throw Object.assign(new Error("A previous send needs reconciliation."), { code: "outcome-unknown" });
  if (admin) {
    const staff = await readCurrentStaff();
    if (staff.principalUid !== user.uid || staff.staffId !== staffActorId
      || !allows(staff, "chats.reply", { purpose: "customer-service", objectId: customerId, assignedStaffId: existing.data()?.assignedStaffId })) throw Object.assign(new Error("Current reply context changed."), { code: "permission-denied" });
    if (!allows(staff, "operations.reconcile", { purpose: "operation-result", objectId: message.id }) && !allows(staff, "audit.read", { purpose: "audit", objectId: message.id })) throw Object.assign(new Error("Current operation-result authority is required before replying."), { code: "permission-denied" });
  }
  if (unresolvedSends.has(operationKey) || pendingStaffOperation(actor, sendKind(customerId))) throw Object.assign(new Error("A previous send needs reconciliation."), { code: "outcome-unknown" });
  const role = admin ? "admin" : "customer";
  const batch = writeBatch(store);
  batch.set(message, { body, senderId: user.uid, senderRole: role, createdAt: serverTimestamp(), ...(context ? { productContext: context } : {}) });
  if (admin) batch.set(doc(store, "staffAudit", message.id), { actorUid: user.uid, actorStaffId: staffActorId, execution: "staff", targetCollection: "conversations", targetId: customerId, action: "reply", outcome: "committed", createdAt: serverTimestamp() });
  const summary = { lastMessageId: message.id, lastMessage: body, lastSenderRole: role, updatedAt: serverTimestamp() };
  // Existing Staff work never bootstraps a Customer conversation/Profile from
  // mutable provider metadata. The Customer owner service must create it.
  batch.update(conversation, summary);
  unresolvedSends.set(operationKey, { message, staffActorId });
  // Persist only the logical message handle before submitting. Reopening or
  // reloading cannot silently unlock another send after a lost response.
  try { beginStaffOperation(actor, sendKind(customerId), message.id); }
  catch (error) { unresolvedSends.delete(operationKey); throw error; }
  try {
    await protectedWriteDeadline(batch.commit());
    if (await reconcileMessage(user.uid, customerId, admin) !== "committed") throw Object.assign(new Error("The send result could not be confirmed."), { code: "outcome-unknown" });
  }
  catch (error) {
    const state = await reconcileMessage(user.uid, customerId, admin);
    if (state === "not-committed" && ["permission-denied", "invalid-argument", "failed-precondition"].includes(error.code)) { unresolvedSends.delete(operationKey); clearStaffOperation(actor, sendKind(customerId), message.id); throw error; }
    if (state !== "committed") throw Object.assign(new Error("Message outcome is unknown."), { code: "outcome-unknown" });
  }
}
export async function reconcileMessage(uid, customerId, admin = false) {
  if (auth.currentUser?.uid !== uid) return "unresolved";
  let staffId = null;
  if (admin) try { staffId = (await readCurrentStaff()).staffId; } catch { return "unresolved"; }
  const key = uid + "/" + (staffId || "customer") + "/" + customerId;
  const actor = sendActor(uid, staffId);
  const retained = pendingStaffOperation(actor, sendKind(customerId));
  const operation = unresolvedSends.get(key) || (retained ? { message: doc(database(), "conversations", customerId, "messages", retained.operationId), staffActorId: staffId } : null);
  if (!operation) return "unresolved";
  try {
    const snapshot = await currentReadDeadline(getDocFromServer(operation.staffActorId ? doc(database(), "staffAudit", operation.message.id) : operation.message));
    if (snapshot.exists() && (operation.staffActorId ? snapshot.data().actorUid === uid && snapshot.data().actorStaffId === staffId && snapshot.data().targetCollection === "conversations" && snapshot.data().targetId === customerId && snapshot.data().action === "reply" && snapshot.data().outcome === "committed" : snapshot.data().senderId === uid)) { unresolvedSends.delete(key); clearStaffOperation(actor, sendKind(customerId), operation.message.id); return "committed"; }
    // Absence alone is not proof of noncommitment: a write may still be in
    // flight. Only the original known rejection path can unlock a fresh send.
    if (!snapshot.exists() && unresolvedSends.has(key)) return "not-committed";
  } catch { /* Unverifiable reads cannot authorize another message. */ }
  return "unresolved";
}
export function chatError(error) {
  if (error?.code === "outcome-unknown") return "The send outcome is unknown. Check the authoritative result before sending again.";
  if (error?.code === "permission-denied") return "Chat access was denied. Please sign in again or contact the site owner if this continues.";
  if (error?.code === "unavailable") return "Chat could not connect. Check your internet connection and try again.";
  return "Chat could not complete this request. Please try again.";
}
