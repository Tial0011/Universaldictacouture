/**
 * Product data access.
 *
 * Only published products ever leave this module — filtering happens
 * both in the Firestore query and again in normaliseProduct, so an
 * unpublished or incomplete document can never reach the public UI.
 *
 * The public Shop reads the published catalogue once per visit and
 * then searches, filters and sorts in memory. That keeps AND/OR filter
 * logic, price ranges and free-text search exact and instant, which a
 * Firestore composite query cannot do without an index per filter
 * combination. If the catalogue grows past a few thousand pieces, move
 * the first cut (category / New In) into the query and keep the rest
 * here.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firestore";
import { isFirebaseConfigured } from "../firebase/config";
import { normaliseProduct } from "./productModel";

const PRODUCTS = "products";
const CATALOGUE_READ_LIMIT = 1000;

export class CatalogueUnavailableError extends Error {
  constructor(message = "The collection could not be loaded.") {
    super(message);
    this.name = "CatalogueUnavailableError";
  }
}

/** Fetch every published product. Throws CatalogueUnavailableError on failure. */
export async function fetchPublishedProducts() {
  if (!isFirebaseConfigured) {
    throw new CatalogueUnavailableError(
      "The collection is not connected yet. Please try again later."
    );
  }

  try {
    const snapshot = await getDocs(
      query(
        collection(db, PRODUCTS),
        where("status", "==", "published"),
        limit(CATALOGUE_READ_LIMIT)
      )
    );

    // Offline, Firestore resolves from its local cache instead of
    // failing. An empty cached result means "we could not reach the
    // catalogue", not "nothing is published" — saying the latter would
    // be untrue during an outage.
    if (snapshot.empty && snapshot.metadata.fromCache) {
      throw new CatalogueUnavailableError();
    }

    return snapshot.docs
      .map((entry) => normaliseProduct(entry.id, entry.data()))
      .filter(Boolean);
  } catch (error) {
    if (error instanceof CatalogueUnavailableError) throw error;
    // Never surface a raw Firebase error to a visitor.
    if (import.meta.env.DEV) console.error(error);
    throw new CatalogueUnavailableError();
  }
}

/**
 * Published products flagged New In, newest first. When nothing has
 * been flagged yet, the most recently published pieces stand in, so
 * the homepage section is never empty while the catalogue is not —
 * "New In" is, honestly, the newest pieces.
 */
export function selectNewIn(products, max = 8) {
  const flagged = products.filter((product) => product.isNewIn);
  return sortByNewest(flagged.length ? flagged : products).slice(0, max);
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
export async function revalidateProduct(productId) {
  if (!isFirebaseConfigured) throw new CatalogueUnavailableError();

  try {
    const snapshot = await getDoc(doc(db, PRODUCTS, productId));
    if (!snapshot.exists()) return null;
    return normaliseProduct(snapshot.id, snapshot.data());
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    throw new CatalogueUnavailableError();
  }
}
