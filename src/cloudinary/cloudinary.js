/**
 * Cloudinary integration.
 *
 * Images are never stored in Firebase Storage — Cloudinary is the
 * single source of truth for product, closet, and review imagery.
 *
 * This uses Cloudinary's unsigned upload endpoint, which needs no
 * SDK and no server-side secret: it authenticates via an unsigned
 * upload preset configured in the Cloudinary dashboard. If a later
 * phase needs signed uploads, transformations that require the API
 * secret, or asset deletion, add a Netlify Function under
 * netlify/functions and call it from a new method here rather than
 * exposing the API secret to the client.
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const UPLOAD_URL = CLOUD_NAME
  ? `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`
  : null;

/**
 * Upload a single image file to Cloudinary using the unsigned preset.
 * @param {File} file
 * @param {{ folder?: string }} [options]
 * @returns {Promise<{ url: string, publicId: string, width: number, height: number }>}
 */
export async function uploadImage(file, options = {}) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  if (options.folder) {
    formData.append("folder", options.folder);
  }

  const response = await fetch(UPLOAD_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Image upload failed. Please try again.");
  }

  const data = await response.json();

  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
  };
}

/**
 * Build a transformed Cloudinary delivery URL from a public ID.
 * @param {string} publicId
 * @param {string} [transformation] e.g. "w_600,h_800,c_fill,q_auto,f_auto"
 */
export function getImageUrl(publicId, transformation = "q_auto,f_auto") {
  if (!CLOUD_NAME || !publicId) return "";
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transformation}/${publicId}`;
}
