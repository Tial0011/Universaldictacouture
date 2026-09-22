import sharp from "sharp";
import { randomUUID } from "node:crypto";
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
const KEY = /^[a-f0-9-]{36}\.webp$/;
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
// Verify the token with Firebase, then read membership under Firestore rules.
// No service-account secret or privileged database bypass is needed.
export async function requireAdmin(request, env = process.env, fetcher = fetch) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new HttpError(401, "Sign in before uploading images.");
  const apiKey = env.FIREBASE_WEB_API_KEY || env.VITE_FIREBASE_API_KEY;
  const project = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !project) throw new HttpError(503, "Image uploads need Firebase configuration in the Netlify Functions environment.");
  const accountResponse = await fetcher("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(apiKey), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(10000),
  });
  if (!accountResponse.ok) throw new HttpError(accountResponse.status >= 500 ? 503 : 401, "Unable to verify your session. Please sign in again.");
  const account = (await accountResponse.json()).users?.[0];
  if (!account?.localId || account.disabled) throw new HttpError(401, "Please sign in with an active account.");
  const membership = await fetcher("https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(project) + "/databases/(default)/documents/admins/" + encodeURIComponent(account.localId), {
    headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(10000),
  });
  if (membership.status >= 500 || membership.status === 429) throw new HttpError(503, "Admin access cannot be checked right now. Please try again.");
  if (!membership.ok || (await membership.json()).fields?.active?.booleanValue !== true) {
    throw new HttpError(403, "An active admin account is required to upload images.");
  }
  return account.localId;
}
export function createImageHandler({ getStore, authorize = requireAdmin }) {
  return async request => {
    try {
      if (request.method === "GET" || request.method === "HEAD") {
        const key = new URL(request.url).searchParams.get("key") || "";
        if (!KEY.test(key)) return json({ error: "Image not found." }, 404);
        const result = await getStore().get(key, { type: "arrayBuffer", consistency: "strong" });
        if (!result) return json({ error: "Image not found." }, 404);
        return new Response(request.method === "HEAD" ? null : result, { headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=3600",
          "Netlify-CDN-Cache-Control": "public, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        } });
      }
      if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD, POST" } });
      const uid = await authorize(request);
      const type = request.headers.get("content-type")?.split(";")[0];
      if (!TYPES[type]) throw new HttpError(415, "Choose a JPEG, PNG or WebP image.");
      if (Number(request.headers.get("content-length")) > MAX_IMAGE_BYTES) throw new HttpError(413, "Choose an image smaller than 4 MB.");
      const input = Buffer.from(await request.arrayBuffer());
      if (!input.length || input.length > MAX_IMAGE_BYTES) throw new HttpError(413, "Choose an image between 1 byte and 4 MB.");
      let output;
      try {
        const image = sharp(input, { limitInputPixels: 40000000, failOn: "warning" });
        const metadata = await image.metadata();
        if (metadata.format !== TYPES[type] || (metadata.pages || 1) > 1) throw new Error("Unsupported image");
        // Decode and re-encode to validate the actual file, strip metadata,
        // correct orientation and bound storage/delivery size.
        output = await image.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      } catch { throw new HttpError(415, "This image could not be read. Choose a valid, non-animated JPEG, PNG or WebP image."); }
      if (output.data.length > MAX_IMAGE_BYTES) throw new HttpError(413, "The processed image is too large. Choose a smaller photo.");
      const key = randomUUID() + ".webp";
      await getStore().set(key, output.data, { metadata: { uploadedBy: uid, createdAt: new Date().toISOString(), width: output.info.width, height: output.info.height } });
      return json({ url: "/.netlify/functions/images?key=" + key, storageKey: key, provider: "netlify", width: output.info.width, height: output.info.height }, 201);
    } catch (error) {
      return json({ error: error.status ? error.message : "Image storage is unavailable. Please try again." }, error.status || 503);
    }
  };
}
