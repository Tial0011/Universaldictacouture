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
export function selectNewIn(products, max = 20) { return sortByNewest(products.filter(product => product.isNewIn)).slice(0, max); }
export function sortByNewest(products) { return [...products].sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0)); }
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
