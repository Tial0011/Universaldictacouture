import { accountRequest } from "./accountApi";
export class CatalogueUnavailableError extends Error {
  constructor(message = "The collection could not be loaded.") { super(message); this.name = "CatalogueUnavailableError"; }
}
const hydrate = product => product ? { ...product, publishedAt: product.publishedAt ? new Date(product.publishedAt) : null } : null;
// Minimized by the owner BEFORE disclosure: no working/internal authoring data.
export async function fetchPublishedProducts() {
  try { return (await accountRequest("catalogue", {}, { publicRequest: true })).products.map(hydrate); }
  catch { throw new CatalogueUnavailableError(); }
}
<<<<<<< HEAD

/**
 * Homepage New In: the newest published pieces, and nothing else.
 *
 * The complete published catalogue is sorted newest-first by
 * publishedAt FIRST (see sortByNewest), and only THEN capped at `max`
 * — never the other way around — so publishing a new piece always
 * promotes it to position #1 and the oldest piece in the previous set
 * falls out automatically once more than `max` pieces are published.
 * publishedAt is set once, at first publish, and never touched again
 * on later edits (see productModel / admin.js), so editing an older
 * piece never makes it look new. This never reads isNewIn and never
 * depends on any manual admin selection.
 */
export function selectNewIn(products, max = 20) {
  return sortByNewest(products).slice(0, max);
}

export function sortByNewest(products) {
  return [...products].sort((a, b) => {
    const aTime = a.publishedAt ? a.publishedAt.getTime() : 0;
    const bTime = b.publishedAt ? b.publishedAt.getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * Re-read the authoritative product document before it enters a Closet
 * line, so a piece that was unpublished or repriced since the grid was
 * rendered cannot be added at a stale price.
 */
=======
export function selectNewIn(products, max = 20) { return sortByNewest(products.filter(product => product.isNewIn)).slice(0, max); }
export function sortByNewest(products) { return [...products].sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0)); }
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
export async function revalidateProduct(productId) {
  try { return hydrate((await accountRequest("catalogue", { productId }, { publicRequest: true })).product); }
  catch { throw new CatalogueUnavailableError(); }
}
export async function validatePublishedProductIds(productIds = []) {
  const ids = [...new Set(productIds.filter(id => typeof id === "string" && id))], valid = [];
  for (let start = 0; start < ids.length; start += 6) {
    valid.push(...(await Promise.all(ids.slice(start, start + 6).map(async id => (await revalidateProduct(id))?.id || null))).filter(Boolean));
  }
  return valid;
}
