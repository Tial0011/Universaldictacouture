import { formatNaira, truncateText } from "../utils/formatters.js";

const clean = value => typeof value === "string" ? value.trim() : "";
export function productDescription(product) {
  if (clean(product?.description)) return clean(product.description);
  // Older products have attributes but no description. Never invent claims.
  return [["Category", product?.category], ["Fabric", product?.fabric], ["Colour", product?.colour]]
    .filter(([, values]) => Array.isArray(values) && values.length)
    .map(([label, values]) => `${label}: ${values.join(", ")}`).join("\n");
}
function pieceSections(product) {
  const price = product?.mainPrice ?? product?.price ?? product?.minPrice;
  return [clean(product?.name) || "Customer story", "Universal Dicta Couture", productDescription(product),
    typeof price === "number" && Number.isFinite(price) ? `${formatNaira(price)}${product?.unitLabel ? ` (${product.unitLabel})` : ""}` : "",
  ].filter(Boolean);
}
function productUrl(product, origin) {
  return new URL(`/shop/${encodeURIComponent(product.slug || product.id)}`, origin).href;
}
export function buildProductShare(product, origin) {
  return { title: `${product.name} | Universal Dicta Couture`, text: [...pieceSections(product), `Discover this piece\n${productUrl(product, origin)}`].join("\n\n") };
}
export function buildReviewShare(review, product, origin) {
  const piece = product || review.productSnapshot;
  const sections = piece ? pieceSections(piece) : ["Customer stories | Universal Dicta Couture"];
  sections.push(`Customer story — ${clean(review.author) || "A customer"}\n“${truncateText(clean(review.body), 300)}”`);
  if (product) sections.push(`Discover this piece\n${productUrl(product, origin)}`);
  sections.push(`Read the review\n${new URL(`/reviews-feeds?review=${encodeURIComponent(review.id)}`, origin).href}`);
  return { title: `${piece?.name || "Customer story"} | Universal Dicta Couture`, text: sections.join("\n\n") };
}
/** One ordered block avoids apps rearranging separate text and URL fields. */
export async function shareContent(payload, browser = window) {
  try {
    if (browser.navigator.share) { await browser.navigator.share(payload); return "shared"; }
  } catch (error) { if (error?.name === "AbortError") return "cancelled"; }
  try {
    if (browser.navigator.clipboard?.writeText) { await browser.navigator.clipboard.writeText(payload.text); return "copied"; }
  } catch { /* Manual copy remains available when clipboard permission is denied. */ }
  return browser.prompt("Copy these details and links", payload.text) === null ? "cancelled" : "prompt";
}
