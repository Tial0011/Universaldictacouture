import { collection, doc, getDocFromServer, getDocsFromServer, query, orderBy, documentId, limit, startAfter, setDoc, serverTimestamp } from "firebase/firestore";
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
  return snapshot.exists() && snapshot.data().active === true;
}
export async function loadAdminPage(kind, cursor = null) {
  const constraints = [orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE)];
  const snapshot = await getDocsFromServer(query(target(kind), ...constraints));
  return { records: snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id })), cursor: snapshot.docs.at(-1) || null, hasMore: snapshot.size === PAGE_SIZE };
}
export async function saveAdminRecord(kind, raw) {
  const data = prepareRecord(kind, raw);
  const reference = raw.id ? doc(target(kind), raw.id) : doc(target(kind));
  if (!raw.id) data.createdAt = serverTimestamp();
  if (kind === "products" && data.status === "published" && !data.publishedAt) data.publishedAt = serverTimestamp();
  await setDoc(reference, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return reference.id;
}
export function adminError(error) {
  if (error?.code === "permission-denied") return "Access was denied. Check your admin access and the published Firestore rules.";
  if (error?.code === "resource-exhausted") return "The database usage limit has been reached. Please try again later.";
  if (error?.code === "unavailable") return "Unable to reach the database. Check your connection and try again.";
  if (error?.code) return "The request could not be completed. Please try again.";
  return error?.message || "Something went wrong. Please try again.";
}
