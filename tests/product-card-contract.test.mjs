import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cardSource = await readFile(new URL("../src/components/product/ProductCard.jsx", import.meta.url), "utf8");
const gridSource = await readFile(new URL("../src/components/product/ProductGrid.jsx", import.meta.url), "utf8");
const imageSource = await readFile(new URL("../src/components/product/ProductImage.jsx", import.meta.url), "utf8");
const cardCss = await readFile(new URL("../src/components/product/ProductCard.css", import.meta.url), "utf8");
const shopCss = await readFile(new URL("../src/pages/Shop/Shop.css", import.meta.url), "utf8");

test("Shop card exposes the locked Revision 4 anatomy and exact CTA", () => {
  assert.match(cardSource, /ProductImage/);
  assert.match(cardSource, /product-card__save/);
  assert.match(cardSource, /product-card__name/);
  assert.match(cardSource, /ProductPrice/);
  assert.match(cardSource, /SHOP THIS PIECE \\u2192/);
});

test("image, name and CTA all use the same canonical product href", () => {
  const hrefTargets = cardSource.match(/to=\{product\.href\}/g) || [];
  assert.equal(hrefTargets.length, 3);
});

test("heart is an independent pressed button and uses confirmed shared save state", () => {
  assert.match(cardSource, /aria-pressed=\{saved\}/);
  assert.match(cardSource, /toggleSavedConfirmed\(product\.id\)/);
  assert.match(cardSource, /disabled=\{savePending\}/);
  assert.doesNotMatch(cardSource, /<Link[^>]*>[\s\S]*<article className=/);
});

test("Shop price presentation never hard-codes a global per-bundle unit", () => {
  assert.doesNotMatch(cardSource.toLowerCase(), /per bundle/);
  assert.match(cardSource, /product\.unitLabel \|\| product\.priceToken/);
  assert.match(cardSource, /product\.hasVariablePricing === true/);
});

test("catalogue image delivery uses real responsive Cloudinary sources and restrained eager loading", () => {
  assert.match(cardSource, /SHOP_IMAGE_SOURCES/);
  assert.match(imageSource, /srcSetSources/);
  assert.match(imageSource, /srcSet=\{srcSet \|\| undefined\}/);
  assert.match(gridSource, /variant === "shop"[\s\S]*\? 2/);
  assert.match(gridSource, /imageFetchPriority=\{index === 0 \? "high" : "auto"\}/);
});

test("Shop grid is one width-driven responsive CSS grid with 4:5 Shop media", () => {
  assert.match(shopCss, /repeat\(auto-fill, minmax\(min\(100%, var\(--shop-card-min\)\), 1fr\)\)/);
  assert.match(cardCss, /--product-card-media-ratio:\s*4 \/ 5/);
  assert.doesNotMatch(shopCss, /grid-template-columns:\s*repeat\(6,/);
});

test("Shop card has visible focus hooks and a neutral broken-image fallback", () => {
  assert.match(cardCss, /product-card__media-link:focus-visible/);
  assert.match(cardCss, /product-card__save:focus-visible/);
  assert.match(cardCss, /product-image--empty::after/);
  assert.match(cardCss, /content:\s*"UDC"/);
});
