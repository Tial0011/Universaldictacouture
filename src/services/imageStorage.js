import { auth } from "../firebase/auth";

const NETLIFY_STORAGE_KEY = /^[a-f0-9-]{36}\.webp$/;

export function ownedNetlifyStorageKey(image) {
  if (!image || typeof image !== "object" || Array.isArray(image)) return "";
  const key = String(image.storageKey || "").trim();
  return image.provider === "netlify" && NETLIFY_STORAGE_KEY.test(key) ? key : "";
}

async function adminToken(action) {
  if (!auth?.currentUser) throw new Error(`Sign in before ${action}.`);
  return auth.currentUser.getIdToken();
}

export async function uploadImage(file) {
  if (!auth?.currentUser) throw new Error("Sign in before uploading photos.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) {
    throw new Error("Choose a JPEG, PNG or WebP image smaller than 4 MB.");
  }
  const token = await adminToken("uploading photos");
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
  if (!data.url || data.provider !== "netlify" || !ownedNetlifyStorageKey(data)) throw new Error("Image storage returned an unexpected response.");
  return data;
}

export async function deleteStoredImage(storageKey) {
  const key = String(storageKey || "").trim();
  if (!NETLIFY_STORAGE_KEY.test(key)) throw new Error("This image is not a managed Universal Dicta Couture upload.");
  const token = await adminToken("deleting stored photos");
  let response;
  try {
    response = await fetch(`/.netlify/functions/images?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
  } catch { throw new Error("Unable to reach image storage. The product record was not recreated; retry media cleanup later if needed."); }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Image deletion requires Netlify Functions. Use Netlify Dev locally or the deployed website.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Stored image cleanup failed.");
  return data;
}
