<<<<<<< HEAD
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firestore";

export async function saveCustomerProfile(user, details = {}) {
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
  if (!db || !uid) return null;
  const snapshot = await getDoc(doc(db, "customerProfiles", uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
=======
import { personalDetailsPayload } from "./profileExperience";
import { accountRequest } from "./accountApi";

export async function saveCustomerProfile(user, details = {}, { operationId, expectedVersion, expectedEpoch } = {}) {
  return accountRequest("profile-save", { operationId, expectedVersion, expectedEpoch, fields: personalDetailsPayload(details) }, { principalUid: user?.uid });
}

export async function fetchCustomerProfile(uid) {
  return accountRequest("profile", {}, { principalUid: uid });
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
}
