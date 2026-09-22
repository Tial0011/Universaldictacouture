import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, startAfter, writeBatch } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { prepareMessage } from "./chatModel";
export const MESSAGE_PAGE_SIZE = 30;
const INBOX_PAGE_SIZE = 20;
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
export async function olderMessages(uid, cursor) {
  return page(await getDocs(messagesQuery(uid, cursor)), MESSAGE_PAGE_SIZE);
}
export async function listConversations(cursor) {
  return page(await getDocs(query(collection(database(), "conversations"), orderBy("updatedAt", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(INBOX_PAGE_SIZE))), INBOX_PAGE_SIZE);
}
export async function sendMessage({ user, customerId, text, admin = false }) {
  if (!user) throw new Error("Please sign in to send a message.");
  if (!admin && customerId !== user.uid) throw new Error("You can only message from your own account.");
  const body = prepareMessage(text);
  const store = database();
  const conversation = doc(store, "conversations", customerId);
  const existing = await getDoc(conversation);
  if (admin && !existing.exists()) throw new Error("This conversation is no longer available.");
  const message = doc(collection(conversation, "messages"));
  const role = admin ? "admin" : "customer";
  const batch = writeBatch(store);
  batch.set(message, { body, senderId: user.uid, senderRole: role, createdAt: serverTimestamp() });
  const summary = { lastMessageId: message.id, lastMessage: body, lastSenderRole: role, updatedAt: serverTimestamp() };
  if (existing.exists()) batch.update(conversation, summary);
  else batch.set(conversation, { ...summary, customerId, customerName: (user.displayName || "Customer").slice(0, 120), customerEmail: user.email || "", createdAt: serverTimestamp() });
  await batch.commit();
}
export function chatError(error) {
  if (error?.code === "permission-denied") return "Chat access was denied. Please sign in again or contact the site owner if this continues.";
  if (error?.code === "unavailable") return "Chat could not connect. Check your internet connection and try again.";
  return "Chat could not complete this request. Please try again.";
}
