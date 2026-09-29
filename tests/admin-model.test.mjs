import test from "node:test";
import assert from "node:assert/strict";
import { DIMENSIONS, localDestination, prepareRecord, productAdminHref, productReadiness } from "../src/services/adminModel.js";
test("draft permits incomplete price but publishing requires price and category", () => {
  assert.equal(prepareRecord("products", { name: "Aso Oke", status: "draft", price: "" }).price, null);
  assert.throws(() => prepareRecord("products", { name: "Aso Oke", status: "published", price: "", category: "Fabric" }));
  assert.throws(() => prepareRecord("products", { name: "Aso Oke", status: "published", price: 100, category: "" }));
  assert.throws(() => prepareRecord("products", { name: "Aso Oke", status: "published", price: 100, category: "Fabric", unitLabel: "per set" }), /product photo/i);
  assert.throws(() => prepareRecord("products", { name: "Aso Oke", status: "published", price: 100, category: "Fabric", primaryImage: { url: "https://example.test/aso-oke.jpg" } }), /commercial unit/i);
  const result = prepareRecord("products", { name: " Aso Oke ", status: "published", price: "12000", unitLabel: "per set", category: "Fabric, Fabric, Ready to wear", primaryImage: { url: "https://example.test/aso-oke.jpg" } });
  assert.equal(result.price, 12000);
  assert.deepEqual(result.category, ["Fabric", "Ready to wear"]);
});
test("archive consistently clears published visibility without losing variants", () => {
  const variants = [{ id: "large", price: 20000, options: { Size: "L" } }];
  const result = prepareRecord("products", { id: "one", name: "Piece", price: 10000, category: "Clothing", status: "archived", variants });
  assert.equal(result.archived, true);
  assert.deepEqual(result.variants, variants);
  assert.equal(result.id, undefined);
});
test("invalid price and visibility are rejected", () => {
  for (const price of [-1, "NaN", Infinity]) assert.throws(() => prepareRecord("products", { name: "Piece", status: "published", category: "Fabric", price }));
  assert.throws(() => prepareRecord("products", { name: "Piece", status: "other" }));
});
test("discovery rejects external and ambiguous links", () => {
  for (const link of ["https://example.com", "//example.com", "/\\example.com", "/ shop"]) assert.equal(localDestination(link), false);
  assert.equal(localDestination("/shop?occasion=Wedding%20Guest"), true);
  assert.throws(() => prepareRecord("discoveryModules", { title: "Shop", placement: "home", active: true, items: [] }));
  assert.throws(() => prepareRecord("discoveryModules", { title: "Shop", placement: "home", active: true, items: [{ name: "Bridal", destination: "//example.com" }] }));
});
test("only approved hero concepts and complete reviews can be saved", () => {
  assert.throws(() => prepareRecord("heroSlides", { headline: "Headline", concept: "other" }));
  assert.throws(() => prepareRecord("reviews", { author: "Customer", body: " " }));
  assert.throws(() => prepareRecord("reviews", { author: "Customer", body: "Lovely", productId: "piece", customerServiceRating: 5, productQualityRating: 0 }));
});

test("reviews use separate ratings, one image, a product and moderation status", () => {
  const pending = prepareRecord("reviews", { author: "Amara", body: "Lovely", status: "pending", productId: "piece", customerServiceRating: 5, productQualityRating: 4 });
  assert.equal(pending.published, false);
  assert.equal(pending.status, "pending");
  const published = prepareRecord("reviews", { author: "Amara", body: "Lovely", status: "published", productId: "piece", customerServiceRating: 5, productQualityRating: 4, image: "https://example.test/review.jpg" });
  assert.equal(published.published, true);
  assert.equal(published.image.url, "https://example.test/review.jpg");
  assert.equal(published.images, undefined);
  assert.throws(() => prepareRecord("reviews", { author: "Amara", body: "Lovely", status: "other", productId: "piece", customerServiceRating: 5, productQualityRating: 4 }));
});

test("new review workflow rejects more than one customer photo", () => {
  const images = ["https://example.test/1.jpg", "https://example.test/2.jpg"];
  assert.throws(() => prepareRecord("reviews", { author: "Amara", body: "Lovely", images, status: "pending", productId: "piece", customerServiceRating: 5, productQualityRating: 4 }));
});


test("Task 8A: product readiness is deterministic and names exact publication blockers", () => {
  const incomplete = productReadiness({ id: "piece-1", name: "", price: "", category: [], images: [], status: "draft" });
  assert.equal(incomplete.state, "needs-attention");
  assert.deepEqual(incomplete.blockers.map((item) => item.key), ["name", "price", "image", "category", "unit"]);

  const ready = productReadiness({ id: "piece-1", name: "Aso Oke", price: 25000, category: ["Fabric"], images: [{ url: "https://example.test/piece.jpg" }], status: "draft", unitLabel: "per bundle" });
  assert.equal(ready.state, "ready");
  assert.equal(ready.ready, true);
  assert.equal(ready.warnings.length, 0);

  const published = productReadiness({ id: "piece-1", name: "Aso Oke", price: 25000, category: ["Fabric"], images: [{ url: "https://example.test/piece.jpg" }], status: "published" });
  assert.equal(published.state, "needs-attention");
  assert.equal(published.blockers.some((item) => item.key === "unit"), true);
});

test("Task 8A: customer preview uses stable slug/id and Shop V1 taxonomy excludes Size", () => {
  assert.equal(productAdminHref({ id: "firestore-id", slug: "royal-weave" }), "/shop/royal-weave");
  assert.equal(productAdminHref({ id: "firestore-id" }), "/shop/firestore-id");
  assert.deepEqual(DIMENSIONS, ["category", "occasion", "style", "fabric", "colour"]);
});
