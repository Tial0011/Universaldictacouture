import test from "node:test";
import assert from "node:assert/strict";
import { prepareRecord, localDestination } from "../src/services/adminModel.js";
test("draft permits incomplete price but publishing requires price and category", () => {
  assert.equal(prepareRecord("products", { name: "Aso Oke", status: "draft", price: "" }).price, null);
  assert.throws(() => prepareRecord("products", { name: "Aso Oke", status: "published", price: "", category: "Fabric" }));
  assert.throws(() => prepareRecord("products", { name: "Aso Oke", status: "published", price: 100, category: "" }));
  const result = prepareRecord("products", { name: " Aso Oke ", status: "published", price: "12000", category: "Fabric, Fabric, Ready to wear" });
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
