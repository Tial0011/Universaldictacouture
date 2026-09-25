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
test("only approved hero concepts and valid reviews can be saved", () => {
  assert.throws(() => prepareRecord("heroSlides", { headline: "Headline", concept: "other" }));
  assert.throws(() => prepareRecord("reviews", { author: "Customer", body: " " }));
});

test("published reviews require independent ratings and a tagged product", () => {
  const draft = prepareRecord("reviews", { author: "Amara", body: "Lovely", published: false });
  assert.equal(draft.customerServiceRating, 0);
  assert.throws(() => prepareRecord("reviews", { author: "Amara", body: "Lovely", published: true, productId: "piece", customerServiceRating: 5 }));
  assert.throws(() => prepareRecord("reviews", { author: "Amara", body: "Lovely", published: true, customerServiceRating: 5, productQualityRating: 5 }));
  const published = prepareRecord("reviews", { author: "Amara", body: "Lovely", published: true, productId: "piece", customerServiceRating: 5, productQualityRating: 4, image: "https://example.test/review.jpg" });
  assert.equal(published.productId, "piece");
  assert.equal(published.images.length, 1);
  assert.equal(published.image.url, "https://example.test/review.jpg");
});

test("review image count is limited to seven", () => {
  const images = Array.from({ length: 8 }, (_, index) => `https://example.test/${index}.jpg`);
  assert.throws(() => prepareRecord("reviews", { author: "Amara", body: "Lovely", images }));
});
