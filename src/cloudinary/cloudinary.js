// Delivery compatibility for existing Cloudinary images.
// All new uploads go through services/imageStorage.js to Netlify Blobs.
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
export function getImageUrl(publicId, transformation = "q_auto,f_auto") {
  if (!CLOUD_NAME || !publicId) return "";
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transformation}/${publicId}`;
}