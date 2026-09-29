export const OWNED_STORAGE_KEY = /^[a-f0-9-]{36}\.webp$/;

export function ownedNetlifyStorageKeys(record = {}) {
  const images = [
    record.primaryImage,
    ...(Array.isArray(record.images) ? record.images : record.images ? [record.images] : []),
  ];
  return [...new Set(images
    .filter((image) => image && typeof image === "object" && image.provider === "netlify")
    .map((image) => String(image.storageKey || "").trim())
    .filter((key) => OWNED_STORAGE_KEY.test(key)))];
}
