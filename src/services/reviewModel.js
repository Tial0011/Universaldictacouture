function normaliseImage(image) {
  if (!image) return null;
  if (typeof image === "string") return image.trim() ? { url: image.trim(), publicId: "", alt: "" } : null;
  const url = String(image.url || image.secureUrl || image.secure_url || "").trim();
  const publicId = String(image.publicId || image.public_id || "").trim();
  if (!url && !publicId) return null;
  return { url, publicId, alt: String(image.alt || "").trim() };
}

export function timestampMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function timestampDate(value) {
  const ms = timestampMs(value);
  return ms ? new Date(ms) : null;
}

function ratingValue(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

export function reviewStatus(raw = {}) {
  const candidate = String(raw.status || "").trim().toLowerCase();
  if (["pending", "published", "hidden"].includes(candidate)) return candidate;
  return raw.published === true ? "published" : "pending";
}
export function reviewIsPublic(review) {
  return review && reviewStatus(review) === "published" && review.published !== false && (review._ownerVersion !== 3 || review.permissions?.publication === true && review.moderation === "APPROVED");
}

function normaliseProductSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  const price = Number(raw.price);
  const image = normaliseImage(raw.image);
  const slug = String(raw.slug || "").trim();
  if (!name && !image && !Number.isFinite(price)) return null;
  return {
    name,
    image,
    price: Number.isFinite(price) && price >= 0 ? price : null,
    slug,
  };
}

/**
 * Normalise current reviews and legacy records into one public shape.
 * Legacy multi-image records remain readable, but the current review system
 * deliberately presents and accepts only one primary customer image.
 */
export function normaliseReviewRecord(id, raw = {}) {
  const body = String(raw.body || "").trim();
  if (!body) return null;

  const legacyImages = Array.isArray(raw.images) ? raw.images.map(normaliseImage).filter(Boolean) : [];
  const primaryImage = normaliseImage(raw.image) || legacyImages[0] || null;
  const status = reviewStatus(raw);

  return {
    id: String(id || ""),
    managed: raw.managed === true,
    author: String(raw.author || raw.customerName || "").trim(),
    body,
    status,
    published: status === "published" || (!raw.status && raw.published === true),
    image: primaryImage,
    // Kept only for legacy compatibility/diagnostics. Public UI uses image only.
    legacyImages,
    customerServiceRating: ratingValue(raw.customerServiceRating ?? raw.serviceRating),
    productQualityRating: ratingValue(raw.productQualityRating ?? raw.qualityRating),
    productId: String(raw.productId || raw.taggedProductId || "").trim(),
    productSnapshot: normaliseProductSnapshot(raw.productSnapshot),
    customerId: String(raw.customerId || raw.uid || "").trim(),
    orderId: String(raw.orderId || "").trim(),
    orderItemId: String(raw.orderItemId || "").trim(),
    submittedAt: raw.submittedAt || raw.createdAt || null,
    publishedAt: raw.publishedAt || null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

/** Homepage freshness is defined strictly by first publication time. */
export function reviewPublishedTime(review) {
  return timestampMs(review?.publishedAt);
}

export function reviewSubmittedTime(review) {
  return timestampMs(review?.submittedAt) || timestampMs(review?.createdAt);
}

export function sortPublishedReviews(reviews) {
  return (Array.isArray(reviews) ? reviews : [])
    .filter((review) => review?.published === true)
    .sort((a, b) => {
      const publicationDelta = reviewPublishedTime(b) - reviewPublishedTime(a);
      if (publicationDelta) return publicationDelta;
      // Legacy records without publishedAt stay behind truly published-at records,
      // while retaining deterministic newest-submission order amongst themselves.
      return reviewSubmittedTime(b) - reviewSubmittedTime(a);
    });
}

/** Latest published reviews, newest first by publishedAt, capped after sorting. */
export function selectLatestPublishedReviews(reviews, max = 20) {
  const safeMax = Math.max(0, Number(max) || 0);
  return sortPublishedReviews(reviews).slice(0, safeMax);
}
