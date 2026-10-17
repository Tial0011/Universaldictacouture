import test from "node:test";
import assert from "node:assert/strict";
import { prepareMessage, mergeMessages, closetEnquiry, MESSAGE_LIMIT, normaliseProductContext, productChatContext } from "../src/services/chatModel.js";

test("closet enquiry preserves selected options and product references without asserting an order", () => {
  const draft = closetEnquiry([{ name: "Aso Oke set", slug: "aso-oke", quantity: 2, selections: { Size: "M", Colour: "Wine" } }]);
  assert.match(draft, /Aso Oke set \(quantity: 2\)/);
  assert.match(draft, /Size: M, Colour: Wine/);
  assert.match(draft, /\/shop\/aso-oke/);
  assert.equal(prepareMessage(draft), draft);
});

test("a large closet produces a valid message with a clear note about remaining selections", () => {
  const lines = Array.from({ length: 100 }, (_, index) => ({ name: `Piece ${index}`, productId: `piece-${index}`, quantity: 1, selections: { Fabric: "Aso Oke" } }));
  const draft = closetEnquiry(lines);
  assert.ok(draft.length <= MESSAGE_LIMIT);
  assert.match(draft, /more selection\(s\) to discuss/);
  assert.equal(prepareMessage(draft), draft);
});
test("empty and oversized messages are rejected, meaningful whitespace preserved", () => {
  for (const value of [null, "  ", "\n\t", "x".repeat(2001)]) assert.throws(() => prepareMessage(value));
  assert.equal(prepareMessage("  Hello\nPlease help  "), "Hello\nPlease help");
  assert.equal(prepareMessage("x".repeat(2000)).length, 2000);
});
test("overlapping history pages do not duplicate messages and server acknowledgement replaces pending data", () => {
  const stamp = value => ({ toMillis: () => value });
  const old = { id: "old", createdAt: stamp(1) };
  const pending = { id: "sent", createdAt: null, pending: true };
  const confirmed = { id: "sent", createdAt: stamp(2), pending: false };
  const next = { id: "next", createdAt: stamp(3) };
  assert.deepEqual(mergeMessages([pending, old], [confirmed, next, old]).map(x => [x.id, x.pending]), [["old", undefined], ["sent", false], ["next", undefined]]);
});

test("review chat carries the tagged piece and original review through a serialisable snapshot", () => {
  const product = { id: "aso", slug: "wine-set", name: "Wine Aso Oke", image: { url: "https://example.test/aso.jpg", publicId: "aso" }, minPrice: 50000, hasVariablePricing: true };
  const tag = productChatContext(product, { id: "review-1", productId: "aso" });
  assert.deepEqual(normaliseProductContext(JSON.parse(JSON.stringify(tag))), tag);
  assert.equal(tag.productId, "aso");
  assert.equal(tag.name, product.name);
  assert.equal(tag.imageUrl, product.image.url);
  assert.equal(tag.price, 50000);
  assert.equal(tag.reviewId, "review-1");
});
test("unavailable reviewed pieces keep their snapshot and missing products do not invent a tag", () => {
  const tag = productChatContext(null, { id: "old", productId: "removed", productSnapshot: { name: "Original piece", price: null, image: null } });
  assert.equal(tag.name, "Original piece");
  assert.equal(tag.price, null);
  assert.equal(productChatContext(null, { id: "no-product" }), null);
  assert.equal(normaliseProductContext({ name: "Missing ID" }), null);
});
test("product context strips unknown fields, unsafe image URLs and invalid prices", () => {
  for (const imageUrl of ["javascript:alert(1)", "data:text/html,test", "//example.test/a", "/\\example.test/a"]) {
    const tag = normaliseProductContext({ productId: "p", name: "A piece", imageUrl, price: -1, admin: true });
    assert.equal(tag.imageUrl, "");
    assert.equal(tag.price, null);
    assert.equal("admin" in tag, false);
  }
  assert.equal(normaliseProductContext({ productId: "p", name: "A piece", imageUrl: "/.netlify/functions/image?id=a" }).imageUrl, "/.netlify/functions/image?id=a");
});
