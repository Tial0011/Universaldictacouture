import test from "node:test";
import assert from "node:assert/strict";
import { buildProductShare, buildReviewShare, shareContent } from "../src/services/shareContent.js";

const origin = "https://universaldictacouture.netlify.app";
const piece = { id: "p1", slug: "wine-aso-oke", name: "Wine Aso Oke", description: "A woven set with a tailored finish.\nAvailable in wine.", minPrice: 50000 };
test("product shares are ordered name, brand, description, price, then a single link", () => {
  const payload = buildProductShare(piece, origin);
  const sections = payload.text.split("\n\n");
  assert.deepEqual(sections.slice(0, 3), [piece.name, "Universal Dicta Couture", piece.description]);
  assert.match(sections[3], /50,000/);
  assert.equal(sections.at(-1), `Discover this piece\n${origin}/shop/wine-aso-oke`);
  assert.equal(payload.text.match(/https:/g).length, 1);
  assert.equal("url" in payload, false);
});
test("review shares retain product details and keep product and review links clearly labelled", () => {
  const text = buildReviewShare({ id: "r/1", author: "Ada", body: "Beautiful finish." }, piece, origin).text;
  assert.ok(text.indexOf(piece.name) < text.indexOf(piece.description));
  assert.ok(text.indexOf(piece.description) < text.indexOf("Customer story — Ada"));
  assert.match(text, /Discover this piece\nhttps:.*\/shop\/wine-aso-oke/);
  assert.ok(text.endsWith(`Read the review\n${origin}/reviews-feeds?review=r%2F1`));
});
test("legacy products share known attributes, without made-up descriptions or broken links", () => {
  const text = buildProductShare({ id: "a/b", name: "Cloth", fabric: ["Aso Oke"], colour: ["Wine"] }, origin).text;
  assert.match(text, /Fabric: Aso Oke\nColour: Wine/);
  assert.ok(text.endsWith("/shop/a%2Fb"));
  const unavailable = buildReviewShare({ id: "old", body: "Lovely", productSnapshot: { name: "Archive piece" } }, null, origin).text;
  assert.doesNotMatch(unavailable, /undefined|\/shop\/|Discover this piece/);
});
test("native sharing receives the same ordered content as clipboard fallback", async () => {
  const payload = buildProductShare(piece, origin);
  let received;
  assert.equal(await shareContent(payload, { navigator: { share: async value => { received = value; } } }), "shared");
  assert.deepEqual(received, payload);
  assert.equal(await shareContent(payload, { navigator: { clipboard: { writeText: async value => { received = value; } } } }), "copied");
  assert.equal(received, payload.text);
});
test("cancelled sharing never copies or prompts unexpectedly", async () => {
  assert.equal(await shareContent({ text: "a" }, { navigator: { share: async () => { throw { name: "AbortError" }; }, clipboard: { writeText: () => assert.fail("must not copy") } }, prompt: () => assert.fail("must not prompt") }), "cancelled");
});
test("unavailable native sharing and denied clipboard still offer manual copy", async () => {
  let received;
  assert.equal(await shareContent({ text: "Details\n\nLink" }, { navigator: { share: async () => { throw new Error("denied"); }, clipboard: { writeText: async () => { throw new Error("denied"); } } }, prompt: (_, value) => { received = value; return value; } }), "prompt");
  assert.equal(received, "Details\n\nLink");
});
