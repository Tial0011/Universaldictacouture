import { auth } from "../firebase/auth";
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
