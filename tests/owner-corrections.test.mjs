import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const productCard = await readFile(new URL("../src/components/product/ProductCard.jsx", import.meta.url), "utf8");
const newInCard = await readFile(new URL("../src/components/home/NewInCard.jsx", import.meta.url), "utf8");
const discovery = await readFile(new URL("../src/components/discovery/DiscoveryModule.jsx", import.meta.url), "utf8");
const newIn = await readFile(new URL("../src/components/home/NewIn.jsx", import.meta.url), "utf8");
const reviews = await readFile(new URL("../src/components/reviews/ReviewCarousel.jsx", import.meta.url), "utf8");
const homeCss = await readFile(new URL("../src/pages/Home/Home.css", import.meta.url), "utf8");
const details = await readFile(new URL("../src/pages/ProductDetails/ProductDetails.jsx", import.meta.url), "utf8");
const productCopy = await readFile(new URL("../src/utils/productCopy.js", import.meta.url), "utf8");
const chatProductTag = await readFile(new URL("../src/components/chat/ChatProductTag.jsx", import.meta.url), "utf8");

test("owner-locked product CTA copy is permanently SHOP PIECE", () => {
  assert.match(productCopy, /PRODUCT_SHOP_CTA = "SHOP PIECE"/);
  assert.match(productCard, /const ctaLabel = PRODUCT_SHOP_CTA/);
  assert.match(newInCard, /PRODUCT_SHOP_CTA/);
  assert.match(chatProductTag, /PRODUCT_SHOP_CTA/);
  assert.doesNotMatch(productCard, /SHOP THIS PIECE|VIEW PIECE|View Piece/);
  assert.doesNotMatch(chatProductTag, /View piece|VIEW PIECE|SHOP THIS PIECE/);
  assert.doesNotMatch(newInCard, />View Piece</);
});

test("homepage rails use adaptive continuous motion on desktop as well as mobile", () => {
  for (const source of [discovery, newIn, reviews]) {
    assert.match(source, /continuousRailSpeed/);
    assert.match(source, /Math\.min\(52, Math\.max\(24, width \* 0\.04\)\)/);
    assert.match(source, /requestAnimationFrame/);
    assert.match(source, /prefersReducedMotion\(\)/);
  }
});

test("Custom Style promo removes the large right-side atlas sticker and sharpens the image edge", () => {
  assert.doesNotMatch(homeCss, /\.home-cultural-flow \.custom-promo \{[^}]*pattern-atlas/s);
  assert.match(homeCss, /98\.75%/);
});

test("Product Details no longer invents bundle as the fallback commercial unit", () => {
  assert.doesNotMatch(details, /\" bundle\"/);
  assert.doesNotMatch(details, /bundles may be suitable/);
  assert.match(details, /Price basis:/);
});
