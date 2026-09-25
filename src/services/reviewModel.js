function normaliseImage(image) {
  if (!image) return null;
  if (typeof image === "string") return image.trim() ? { url: image.trim(), publicId: "", alt: "" } : null;
  const url = String(image.url || image.secureUrl || image.secure_url || "").trim();
  const publicId = String(image.publicId || image.public_id || "").trim();
  if (!url && !publicId) return null;
  return { url, publicId, alt: String(image.alt || "").trim() };
}

function timestampMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratingValue(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

/**
 * Normalize both the current review shape and legacy {author, body, image,
 * published} records into the public UI shape. Missing optional fields are
 * deliberately tolerated so old Firestore content never crashes the feed.
 */
export function normaliseReviewRecord(id, raw = {}) {
  const body = String(raw.body || "").trim();
  if (!body) return null;

  const sourceImages = Array.isArray(raw.images)
    ? raw.images
    : raw.image
      ? [raw.image]
      : [];
  const images = sourceImages.map(normaliseImage).filter(Boolean).slice(0, 7);
  const primaryImage = images[0] || normaliseImage(raw.image);

  return {
    id: String(id || ""),
    author: String(raw.author || raw.customerName || "").trim(),
    body,
    published: raw.published === true,
    images: images.length ? images : primaryImage ? [primaryImage] : [],
    image: primaryImage || null,
    customerServiceRating: ratingValue(raw.customerServiceRating ?? raw.serviceRating),
    productQualityRating: ratingValue(raw.productQualityRating ?? raw.qualityRating),
    productId: String(raw.productId || raw.taggedProductId || "").trim(),
    likeCount: Math.max(0, Number.isFinite(Number(raw.likeCount)) ? Math.floor(Number(raw.likeCount)) : 0),
    publishedAt: raw.publishedAt || null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

export function reviewChronology(review) {
  return timestampMs(review?.publishedAt) || timestampMs(review?.createdAt) || timestampMs(review?.updatedAt);
}

/** Latest published reviews, newest first, capped after sorting. */
export function selectLatestPublishedReviews(reviews, max = 20) {
  const safeMax = Math.max(0, Number(max) || 0);
  return (Array.isArray(reviews) ? reviews : [])
    .filter((review) => review?.published === true)
    .sort((a, b) => reviewChronology(b) - reviewChronology(a))
    .slice(0, safeMax);
}
