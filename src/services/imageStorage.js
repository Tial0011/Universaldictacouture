import { auth } from "../firebase/auth";
import { OWNED_STORAGE_KEY, ownedNetlifyStorageKeys } from "./imageStorageModel";

export async function uploadImage(file) {
  if (!auth?.currentUser) throw new Error("Sign in before uploading photos.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) {
    throw new Error("Choose a JPEG, PNG or WebP image smaller than 4 MB.");
  }
  const token = await auth.currentUser.getIdToken();
  let response;
  try {
    response = await fetch("/.netlify/functions/images", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": file.type },
      body: file,
    });
  } catch { throw new Error("Unable to reach image storage. Check your connection and try again."); }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Image uploads require Netlify Functions. Use Netlify Dev locally or the deployed website.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Image upload failed. Please try again.");
  if (!data.url || data.provider !== "netlify") throw new Error("Image storage returned an unexpected response.");
  return data;
}

export async function deleteStoredImage(storageKey) {
  if (!OWNED_STORAGE_KEY.test(String(storageKey || ""))) throw new Error("This photo is not managed by Universal Dicta Couture image storage.");
  if (!auth?.currentUser) throw new Error("Sign in before deleting stored photos.");
  const token = await auth.currentUser.getIdToken();
  let response;
  try {
    response = await fetch("/.netlify/functions/images?key=" + encodeURIComponent(storageKey), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
  } catch { throw new Error("Unable to reach image storage. Check your connection and try again."); }
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;
  if (!response.ok) throw new Error(data?.error || "The stored photo could not be deleted. Please try again.");
  if (!data?.deleted) throw new Error("Image storage returned an unexpected deletion response.");
  return data;
}

export async function cleanupOwnedProductImages(record = {}) {
  const keys = ownedNetlifyStorageKeys(record);
  if (!keys.length) return { deleted: [], failed: [], legacyOrExternalRetained: true };
  const results = await Promise.allSettled(keys.map((key) => deleteStoredImage(key)));
  const deleted = [];
  const failed = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") deleted.push(keys[index]);
    else failed.push({ key: keys[index], message: result.reason?.message || "Stored photo deletion failed." });
  });
  return { deleted, failed, legacyOrExternalRetained: true };
}
