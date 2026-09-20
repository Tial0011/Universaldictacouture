/**
 * Product model.
 *
 * Firestore documents are author-facing and will grow as the admin
 * tools are built, so every read passes through here and the rest of
 * the app only ever sees this normalised shape. Anything that fails
 * the publishing-completeness rules is dropped rather than shown with
 * invented data.
 */

import { normaliseText } from "../utils/search";

/** Taxonomy dimensions the Shop filters on. */
export const FILTER_DIMENSIONS = [
  { key: "category", label: "Category" },
  { key: "occasion", label: "Occasion" },
  { key: "style", label: "Style" },
  { key: "fabric", label: "Fabric/Weave" },
  { key: "colour", label: "Colour" },
  { key: "size", label: "Size" },
];

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value === 0) return ["0"];
  if (!value) return [];
  return [String(value)];
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normaliseImage(image) {
  if (!image) return null;
  if (typeof image === "string") return { url: image, publicId: "", alt: "" };
  const url = image.url || image.secureUrl || image.secure_url || "";
  const publicId = image.publicId || image.public_id || "";
  if (!url && !publicId) return null;
  return { url, publicId, alt: image.alt || "" };
}

function normaliseOptions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((option, index) => {
      const name = option?.name ? String(option.name) : "";
      const values = toArray(option?.values);
      if (!name || values.length === 0) return null;
      return {
        id: option?.id ? String(option.id) : `option-${index}`,
        name,
        values,
        required: option?.required !== false,
      };
    })
    .filter(Boolean);
}

function normaliseVariants(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((variant) => {
      const price = toNumber(variant?.price);
      if (price === null || price < 0) return null;
      return {
        id: variant?.id ? String(variant.id) : "",
        price,
        options: variant?.options && typeof variant.options === "object" ? variant.options : {},
      };
    })
    .filter(Boolean);
}

/**
 * Convert a raw Firestore document into the shape the UI uses.
 * Returns null when the document is not publishable.
 */
export function normaliseProduct(id, raw) {
  if (!raw || typeof raw !== "object") return null;

  const status = String(raw.status ?? (raw.published ? "published" : "")).toLowerCase();
  const isPublished = status === "published" && raw.archived !== true;
  if (!isPublished) return null;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const slug = String(raw.slug || id || "").trim();
  if (!slug) return null;

  const imageSource = Array.isArray(raw.images) ? raw.images : raw.images ? [raw.images] : [];
  const images = imageSource.map(normaliseImage).filter(Boolean);
  // A piece with no uploaded photo yet is still publishable: the
  // storefront supplies a stand-in image (see NewInCard) rather than
  // hiding the piece.
  const primaryImage = normaliseImage(raw.primaryImage) || images[0] || null;

  const options = normaliseOptions(raw.options);
  const variants = normaliseVariants(raw.variants);

  const basePrice = toNumber(raw.price);
  const variantPrices = variants.map((variant) => variant.price);
  const prices = [basePrice, ...variantPrices].filter(
    (price) => typeof price === "number" && price >= 0
  );
  if (!prices.length) return null;

  const category = toArray(raw.category ?? raw.categories);
  if (!category.length) return null;

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const product = {
    id,
    slug,
    name,
    href: `/shop/${encodeURIComponent(slug)}`,
    image: primaryImage,
    images: images.length ? images : primaryImage ? [primaryImage] : [],
    minPrice,
    maxPrice,
    hasVariablePricing: maxPrice > minPrice,
    unitLabel: typeof raw.unitLabel === "string" ? raw.unitLabel.trim() : "",
    category,
    occasion: toArray(raw.occasion ?? raw.occasions),
    style: toArray(raw.style ?? raw.styles),
    fabric: toArray(raw.fabric ?? raw.weave ?? raw.fabrics),
    colour: toArray(raw.colour ?? raw.color ?? raw.colours),
    size: toArray(raw.size ?? raw.sizes),
    isNewIn: raw.isNewIn === true || raw.newIn === true,
    publishedAt: toDate(raw.publishedAt ?? raw.firstPublishedAt),
    options,
    variants,
    aliases: toArray(raw.aliases),
    keywords: toArray(raw.keywords),
  };

  product.searchText = buildSearchText(product);
  return product;
}

function buildSearchText(product) {
  return normaliseText(
    [
      product.name,
      ...product.category,
      ...product.occasion,
      ...product.style,
      ...product.fabric,
      ...product.colour,
      ...product.size,
      ...product.aliases,
      ...product.keywords,
    ].join(" ")
  );
}

/** Options the visitor must resolve before a Closet line can exist. */
export function requiredOptions(product) {
  return (product?.options ?? []).filter((option) => option.required);
}

/**
 * True when nothing is left for the visitor to choose: either there
 * are no required options, or every required option has exactly one
 * possible value, or a selection has already been supplied.
 */
export function resolveSelections(product, selections = {}) {
  const missing = [];
  const resolved = {};

  requiredOptions(product).forEach((option) => {
    const supplied = selections?.[option.name];
    if (supplied && option.values.includes(supplied)) {
      resolved[option.name] = supplied;
      return;
    }
    if (option.values.length === 1) {
      resolved[option.name] = option.values[0];
      return;
    }
    missing.push(option.name);
  });

  return { resolved, missing, isComplete: missing.length === 0 };
}

/** Stable key so identical product + options share one Closet line. */
export function closetLineKey(productId, selections = {}) {
  const entries = Object.entries(selections)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [String(key), String(value)])
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? `${productId}::${JSON.stringify(entries)}` : `${productId}::`;
}

/** The price a given set of selections resolves to, when determinable. */
export function priceForSelections(product, selections = {}) {
  if (!product) return null;
  if (!product.variants.length) return product.minPrice;
  const match = product.variants.find((variant) =>
    Object.entries(variant.options ?? {}).every(
      ([key, value]) => String(selections?.[key] ?? "") === String(value)
    )
  );
  return match ? match.price : product.minPrice;
}
