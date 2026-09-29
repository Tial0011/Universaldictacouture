import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normaliseProduct, FILTER_DIMENSIONS } from "../src/services/productModel.js";
import { prepareRecord } from "../src/services/adminModel.js";
import { mergeValidatedSavedIds, reviewIds } from "../src/services/savedReviewStore.js";
import { sortProducts } from "../src/utils/shopState.js";

const image = { url: "https://example.test/product.jpg" };
const published = (overrides = {}) => ({
  name: "Aso Oke Piece",
  status: "published",
  archived: false,
  price: 25000,
  unitLabel: "per set",
  category: ["Aso Oke"],
  primaryImage: image,
  publishedAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

test("public model excludes draft, unpublished and archived catalogue records", () => {
  assert.equal(normaliseProduct("draft", published({ status: "draft" })), null);
  assert.equal(normaliseProduct("unpublished", published({ status: "unpublished" })), null);
  assert.equal(normaliseProduct("archived", published({ status: "archived", archived: true })), null);
  assert.equal(normaliseProduct("legacy-archived", published({ status: "published", archived: true })), null);
  assert.equal(normaliseProduct("live", published())?.id, "live");
});

test("public model rejects incomplete published records without inventing data", () => {
  assert.equal(normaliseProduct("missing-name", published({ name: "" })), null);
  assert.equal(normaliseProduct("missing-price", published({ price: null })), null);
  assert.equal(normaliseProduct("formatted-price", published({ price: "₦25,000" })), null);
  assert.equal(normaliseProduct("missing-category", published({ category: [] })), null);
  assert.equal(normaliseProduct("missing-image", published({ primaryImage: null, images: [] })), null);
});

test("admin publish gate rejects incomplete data and accepts a complete product", () => {
  assert.throws(() => prepareRecord("products", { status: "published", price: 1, category: "Fabric", primaryImage: image }), /Product name/i);
  assert.throws(() => prepareRecord("products", { name: "Piece", status: "published", price: "", category: "Fabric", primaryImage: image }), /price/i);
  assert.throws(() => prepareRecord("products", { name: "Piece", status: "published", price: 1, category: "", primaryImage: image }), /category/i);
  assert.throws(() => prepareRecord("products", { name: "Piece", status: "published", price: 1, category: "Fabric", primaryImage: {} }), /valid product photo/i);
  const ready = prepareRecord("products", { name: " Piece ", status: "published", price: "25000", unitLabel: "per set", category: "Fabric", primaryImage: image });
  assert.equal(ready.name, "Piece");
  assert.equal(ready.price, 25000);
  assert.equal(ready.unitLabel, "per set");
  assert.equal(ready.archived, false);
});

test("price sorting uses numeric values rather than formatted display strings", () => {
  const low = normaliseProduct("low", published({ name: "Low", price: 25000 }));
  const high = normaliseProduct("high", published({ name: "High", price: 100000 }));
  assert.deepEqual(sortProducts([high, low], "price-asc").map((item) => item.id), ["low", "high"]);
  assert.deepEqual(sortProducts([low, high], "price-desc").map((item) => item.id), ["high", "low"]);
});

test("commercial unit remains product-specific and public model does not leak stock fields", () => {
  const bundle = normaliseProduct("bundle", published({ unitLabel: "per bundle", stock: 2, productionStatus: "ready" }));
  const set = normaliseProduct("set", published({ unitLabel: "complete set", stock: 10, productionStatus: "custom" }));
  assert.equal(bundle.unitLabel, "per bundle");
  assert.equal(set.unitLabel, "complete set");
  assert.equal(Object.hasOwn(bundle, "stock"), false);
  assert.equal(Object.hasOwn(bundle, "productionStatus"), false);
});

test("guest to Profile merge is a validated union with deduplication", () => {
  assert.deepEqual(
    mergeValidatedSavedIds(["A", "B"], ["B", "C", "STALE"], ["B", "C"]),
    ["A", "B", "C"]
  );
});

test("Size is not a public Shop filter dimension", () => {
  assert.equal(FILTER_DIMENSIONS.some((dimension) => dimension.key === "size"), false);
});

test("first-publication write path preserves existing publication chronology", async () => {
  const source = await readFile(new URL("../src/services/admin.js", import.meta.url), "utf8");
  assert.match(source, /raw\.publishedAt \|\| raw\.firstPublishedAt/);
  assert.match(source, /data\.publishedAt = existingPublishedAt/);
  assert.doesNotMatch(source, /publishedAt\s*=\s*.*updatedAt/);
});



test("saved product identities are normalized and deduplicated before merge", () => {
  assert.deepEqual(reviewIds(["A", " A ", "", "B", "B"]), ["A", "B"]);
  assert.deepEqual(
    mergeValidatedSavedIds(["A"], [" A ", "B", "STALE"], ["A", "B"]),
    ["A", "B"]
  );
});

test("account-private My Closet storage remains UID scoped and Firestore ownership stays private", async () => {
  const contextSource = await readFile(new URL("../src/context/SavedPiecesContext.jsx", import.meta.url), "utf8");
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(contextSource, /udc:saved-pieces:account:\$\{uid\}/);
  assert.match(contextSource, /doc\(db, "savedPieces", uid\)/);
  assert.match(rules, /match \/savedPieces\/\{uid\}/);
  assert.match(rules, /request\.auth != null && request\.auth\.uid == uid/);
});

test("guest merge validates only saved product identities instead of downloading the whole catalogue", async () => {
  const productSource = await readFile(new URL("../src/services/products.js", import.meta.url), "utf8");
  const contextSource = await readFile(new URL("../src/context/SavedPiecesContext.jsx", import.meta.url), "utf8");
  assert.match(productSource, /validatePublishedProductIds/);
  assert.match(productSource, /getDocFromServer\(doc\(db, PRODUCTS, productId\)\)/);
  assert.match(contextSource, /validatePublishedProductIds\(guestMergeIds\)/);
});

test("canonical Product Details URL is based on stable slug with document ID fallback", () => {
  const bySlug = normaliseProduct("doc-123", published({ slug: "royal-weave" }));
  const byId = normaliseProduct("doc-456", published({ slug: "" }));
  assert.equal(bySlug.href, "/shop/royal-weave");
  assert.equal(byId.href, "/shop/doc-456");
});
test("public Firestore query is constrained to published status and publish rules enforce completeness", async () => {
  const productSource = await readFile(new URL("../src/services/products.js", import.meta.url), "utf8");
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(productSource, /where\("status", "==", "published"\)/);
  assert.match(rules, /request\.resource\.data\.price is number/);
  assert.match(rules, /request\.resource\.data\.category is list/);
  assert.match(rules, /hasPublicProductImage\(request\.resource\.data\)/);
  // Size may remain a legacy/internal taxonomy value, but FILTER_DIMENSIONS
  // keeps it out of the V1 public Shop.
  assert.equal(FILTER_DIMENSIONS.some((dimension) => dimension.key === "size"), false);
});
