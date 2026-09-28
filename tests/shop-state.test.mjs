import test from "node:test";
import assert from "node:assert/strict";
import { normaliseProduct, FILTER_DIMENSIONS } from "../src/services/productModel.js";
import {
  EMPTY_STATE,
  applyShopState,
  buildSearchParams,
  filterProducts,
  parseShopState,
  sortProducts,
} from "../src/utils/shopState.js";

function piece(id, overrides = {}) {
  return normaliseProduct(id, {
    name: `Piece ${id}`,
    slug: id,
    status: "published",
    price: 100,
    unitLabel: "per set",
    category: ["Aso Oke Fabric"],
    occasion: ["Wedding Guest"],
    style: ["Classic"],
    fabric: ["Handwoven"],
    colour: ["Burgundy"],
    primaryImage: { url: `https://example.test/${id}.jpg` },
    publishedAt: "2026-09-20T12:00:00.000Z",
    ...overrides,
  });
}

test("Shop filter dimensions exclude Size and retain approved V1 dimensions", () => {
  assert.deepEqual(
    FILTER_DIMENSIONS.map(({ key }) => key),
    ["category", "occasion", "style", "fabric", "colour"]
  );
});

test("Shop uses OR within a filter dimension and AND between dimensions", () => {
  const products = [
    piece("burgundy", { occasion: ["Wedding Guest"], colour: ["Burgundy"] }),
    piece("wine", { occasion: ["Traditional Engagement"], colour: ["Wine"] }),
    piece("blue", { occasion: ["Church"], colour: ["Blue"] }),
  ];
  const state = {
    ...EMPTY_STATE,
    filters: {
      ...EMPTY_STATE.filters,
      occasion: ["Wedding Guest", "Traditional Engagement"],
      colour: ["Burgundy", "Wine"],
    },
  };
  assert.deepEqual(filterProducts(products, state).map((p) => p.id), ["burgundy", "wine"]);

  const narrower = {
    ...state,
    filters: { ...state.filters, colour: ["Burgundy"] },
  };
  assert.deepEqual(filterProducts(products, narrower).map((p) => p.id), ["burgundy"]);
});

test("Newest First is based on first-published chronology rather than edit order", () => {
  const products = [
    piece("old", { publishedAt: "2026-08-01T00:00:00.000Z" }),
    piece("new", { publishedAt: "2026-09-25T00:00:00.000Z" }),
    piece("middle", { publishedAt: "2026-09-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(sortProducts(products, "newest").map((p) => p.id), ["new", "middle", "old"]);
});

test("New In is a distinct merchandising context from Newest First", () => {
  const products = [
    piece("newest-not-curated", { publishedAt: "2026-09-27T00:00:00.000Z", isNewIn: false }),
    piece("curated", { publishedAt: "2026-09-01T00:00:00.000Z", isNewIn: true }),
  ];
  const state = { ...EMPTY_STATE, newIn: true };
  assert.deepEqual(applyShopState(products, state).map((p) => p.id), ["curated"]);
});

test("Shop URL state is refresh-safe and no obsolete view toggle is serialized", () => {
  const input = new URLSearchParams();
  input.set("q", "wine weave");
  input.append("occasion", "Wedding Guest");
  input.append("occasion", "Church");
  input.set("min", "15000");
  input.set("max", "80000");
  input.set("sort", "price-desc");
  input.set("newin", "1");
  input.set("discovery", "occasion");
  input.set("view", "list");

  const parsed = parseShopState(input);
  assert.equal(Object.hasOwn(parsed, "view"), false);
  const roundTrip = buildSearchParams(parsed);
  assert.equal(roundTrip.has("view"), false);
  assert.equal(roundTrip.get("q"), "wine weave");
  assert.deepEqual(roundTrip.getAll("occasion"), ["Wedding Guest", "Church"]);
  assert.equal(roundTrip.get("sort"), "price-desc");
  assert.equal(roundTrip.get("newin"), "1");
  assert.equal(roundTrip.get("discovery"), "occasion");
});

test("Size metadata is not searchable on Shop even when legacy product data contains it", () => {
  const legacy = piece("legacy-size", { size: ["XXXL"], name: "Plain Fabric" });
  assert.equal(legacy.size.includes("XXXL"), true);
  assert.equal(legacy.searchText.includes("xxxl"), false);
});



test("Custom Style is never restored as a Shop Style filter", () => {
  const params = new URLSearchParams();
  params.append("style", "Custom Style");
  params.append("style", "Classic");
  const parsed = parseShopState(params);
  assert.deepEqual(parsed.filters.style, ["Classic"]);
});
