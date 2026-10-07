import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { requireCustomerAccountAuthority } from "./customerAccountAuthority";

export async function saveCustomerProfile(user, details = {}) {
  requireCustomerAccountAuthority();
  if (!db || !user?.uid) return;
  const data = {
    email: String(user.email || "").trim(),
    updatedAt: serverTimestamp(),
  };
  if (details.fullName !== undefined) data.fullName = String(details.fullName || user.displayName || "").trim();
  if (details.phoneNumber !== undefined) data.phoneNumber = String(details.phoneNumber || "").trim();
  await setDoc(doc(db, "customerProfiles", user.uid), data, { merge: true });
}

export async function fetchCustomerProfile(uid) {
  requireCustomerAccountAuthority();
  if (!db || !uid) return null;
  const snapshot = await getDoc(doc(db, "customerProfiles", uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}
