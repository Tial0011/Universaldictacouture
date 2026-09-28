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

// ── Pre-existing tests ────────────────────────────────────────────────────

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

// ── Task 3 round-trip tests A-P ───────────────────────────────────────────

// A. Search survives parse/build round trip.
test("A: search query survives parse/build round trip", () => {
  const params = buildSearchParams({ ...EMPTY_STATE, query: "indigo handwoven" });
  const parsed = parseShopState(params);
  assert.equal(parsed.query, "indigo handwoven");
  const rebuilt = buildSearchParams(parsed);
  assert.equal(rebuilt.get("q"), "indigo handwoven");
});

// B. Sort survives parse/build round trip.
test("B: every sort option survives parse/build round trip", () => {
  for (const sort of ["newest", "price-asc", "price-desc"]) {
    const params = buildSearchParams({ ...EMPTY_STATE, sort });
    const parsed = parseShopState(params);
    assert.equal(parsed.sort, sort);
    const rebuilt = buildSearchParams(parsed);
    // "newest" is the default and must not produce URL noise.
    if (sort === "newest") {
      assert.equal(rebuilt.has("sort"), false);
    } else {
      assert.equal(rebuilt.get("sort"), sort);
    }
  }
});

// C. New In survives parse/build round trip.
test("C: New In survives parse/build round trip", () => {
  const params = buildSearchParams({ ...EMPTY_STATE, newIn: true });
  const parsed = parseShopState(params);
  assert.equal(parsed.newIn, true);
  const rebuilt = buildSearchParams(parsed);
  assert.equal(rebuilt.get("newin"), "1");

  // false must not produce URL noise.
  const paramsOff = buildSearchParams({ ...EMPTY_STATE, newIn: false });
  assert.equal(paramsOff.has("newin"), false);
  const parsedOff = parseShopState(paramsOff);
  assert.equal(parsedOff.newIn, false);
});

// D. Category survives parse/build round trip.
test("D: category filter survives parse/build round trip", () => {
  const state = { ...EMPTY_STATE, filters: { ...EMPTY_STATE.filters, category: ["Ready To Wear"] } };
  const params = buildSearchParams(state);
  const parsed = parseShopState(params);
  assert.deepEqual(parsed.filters.category, ["Ready To Wear"]);
  const rebuilt = buildSearchParams(parsed);
  assert.deepEqual(rebuilt.getAll("category"), ["Ready To Wear"]);
});

// E. Occasion survives parse/build round trip.
test("E: occasion filter survives parse/build round trip", () => {
  const state = {
    ...EMPTY_STATE,
    filters: { ...EMPTY_STATE.filters, occasion: ["Traditional Engagement"] },
  };
  const params = buildSearchParams(state);
  const parsed = parseShopState(params);
  assert.deepEqual(parsed.filters.occasion, ["Traditional Engagement"]);
  const rebuilt = buildSearchParams(parsed);
  assert.deepEqual(rebuilt.getAll("occasion"), ["Traditional Engagement"]);
});

// F. Style survives parse/build round trip.
test("F: style filter survives parse/build round trip", () => {
  const state = {
    ...EMPTY_STATE,
    filters: { ...EMPTY_STATE.filters, style: ["Contemporary"] },
  };
  const params = buildSearchParams(state);
  const parsed = parseShopState(params);
  assert.deepEqual(parsed.filters.style, ["Contemporary"]);
  const rebuilt = buildSearchParams(parsed);
  assert.deepEqual(rebuilt.getAll("style"), ["Contemporary"]);
});

// G. Fabric / Weave survives parse/build round trip.
test("G: fabric filter survives parse/build round trip", () => {
  const state = {
    ...EMPTY_STATE,
    filters: { ...EMPTY_STATE.filters, fabric: ["Kijipa"] },
  };
  const params = buildSearchParams(state);
  const parsed = parseShopState(params);
  assert.deepEqual(parsed.filters.fabric, ["Kijipa"]);
  const rebuilt = buildSearchParams(parsed);
  assert.deepEqual(rebuilt.getAll("fabric"), ["Kijipa"]);
});

// H. Colour survives parse/build round trip.
test("H: colour filter survives parse/build round trip", () => {
  const state = {
    ...EMPTY_STATE,
    filters: { ...EMPTY_STATE.filters, colour: ["Wine"] },
  };
  const params = buildSearchParams(state);
  const parsed = parseShopState(params);
  assert.deepEqual(parsed.filters.colour, ["Wine"]);
  const rebuilt = buildSearchParams(parsed);
  assert.deepEqual(rebuilt.getAll("colour"), ["Wine"]);
});

// I. Price Range survives parse/build round trip.
test("I: price range survives parse/build round trip", () => {
  const state = { ...EMPTY_STATE, min: 10000, max: 80000 };
  const params = buildSearchParams(state);
  const parsed = parseShopState(params);
  assert.equal(parsed.min, 10000);
  assert.equal(parsed.max, 80000);
  const rebuilt = buildSearchParams(parsed);
  assert.equal(rebuilt.get("min"), "10000");
  assert.equal(rebuilt.get("max"), "80000");

  // reversed range is swapped, not discarded.
  const reversed = new URLSearchParams();
  reversed.set("min", "80000");
  reversed.set("max", "10000");
  const parsedReversed = parseShopState(reversed);
  assert.equal(parsedReversed.min, 10000);
  assert.equal(parsedReversed.max, 80000);
});

// J. Discovery / Shop By selection survives parse/build round trip.
test("J: discovery group selection survives parse/build round trip", () => {
  const state = { ...EMPTY_STATE, discovery: "style" };
  const params = buildSearchParams(state);
  const parsed = parseShopState(params);
  assert.equal(parsed.discovery, "style");
  const rebuilt = buildSearchParams(parsed);
  assert.equal(rebuilt.get("discovery"), "style");

  // shopby non-dimension group (e.g. a custom admin group) survives unchanged.
  const params2 = new URLSearchParams();
  params2.append("shopby", "custom-group:Bridal");
  const parsed2 = parseShopState(params2);
  assert.deepEqual(parsed2.shopBy["custom-group"], ["Bridal"]);
  const rebuilt2 = buildSearchParams(parsed2);
  assert.deepEqual(rebuilt2.getAll("shopby"), ["custom-group:Bridal"]);
});

// K. Multiple simultaneous dimensions are not lost.
test("K: multiple simultaneous filter dimensions all survive round trip", () => {
  const state = {
    ...EMPTY_STATE,
    filters: {
      category: ["Aso Oke Fabric"],
      occasion: ["Church"],
      style: ["Classic"],
      fabric: ["Handwoven"],
      colour: ["Burgundy"],
    },
  };
  const params = buildSearchParams(state);
  const parsed = parseShopState(params);
  assert.deepEqual(parsed.filters.category, ["Aso Oke Fabric"]);
  assert.deepEqual(parsed.filters.occasion, ["Church"]);
  assert.deepEqual(parsed.filters.style, ["Classic"]);
  assert.deepEqual(parsed.filters.fabric, ["Handwoven"]);
  assert.deepEqual(parsed.filters.colour, ["Burgundy"]);
});

// L. OR selections inside a single dimension are preserved.
test("L: multiple OR values inside one dimension survive round trip", () => {
  const state = {
    ...EMPTY_STATE,
    filters: {
      ...EMPTY_STATE.filters,
      occasion: ["Wedding Guest", "Church", "Traditional Engagement"],
    },
  };
  const params = buildSearchParams(state);
  const parsed = parseShopState(params);
  assert.deepEqual(
    [...parsed.filters.occasion].sort(),
    ["Church", "Traditional Engagement", "Wedding Guest"]
  );
  const rebuilt = buildSearchParams(parsed);
  assert.deepEqual(
    rebuilt.getAll("occasion").sort(),
    ["Church", "Traditional Engagement", "Wedding Guest"]
  );
});

// M. Legacy supported URL parameters still parse safely.
test("M: legacy ?occasion= URL parameters parse into canonical filter state", () => {
  const params = new URLSearchParams();
  params.append("occasion", "Wedding Guest");
  params.append("occasion", "Church");
  const parsed = parseShopState(params);
  assert.deepEqual(parsed.filters.occasion.sort(), ["Church", "Wedding Guest"]);
  assert.equal(parsed.shopBy.occasion, undefined);
});

// N. Canonical output does not write duplicate conflicting parameters.
test("N: URL with both ?occasion= and ?shopby=occasion: produces no duplicate output", () => {
  const params = new URLSearchParams();
  params.append("occasion", "Wedding Guest");
  params.append("shopby", "occasion:Wedding Guest");
  const parsed = parseShopState(params);
  // shopby:occasion must be promoted into filters.occasion; shopBy.occasion must not exist.
  assert.deepEqual(parsed.filters.occasion, ["Wedding Guest"]);
  assert.equal(parsed.shopBy.occasion, undefined);

  const rebuilt = buildSearchParams(parsed);
  // Only canonical form written: ?occasion= — no ?shopby=occasion: duplication.
  assert.deepEqual(rebuilt.getAll("occasion"), ["Wedding Guest"]);
  assert.deepEqual(
    rebuilt.getAll("shopby").filter((v) => v.startsWith("occasion:")),
    []
  );
});

// O. Unknown or malformed URL values fail safely.
test("O: unknown sort key falls back to newest; malformed price is discarded", () => {
  const params = new URLSearchParams();
  params.set("sort", "random-junk");
  params.set("min", "not-a-number");
  params.set("max", "-99"); // negative is invalid per toPrice()
  const parsed = parseShopState(params);
  assert.equal(parsed.sort, "newest");
  assert.equal(parsed.min, null);
  assert.equal(parsed.max, null);
});

// P. Empty/default state does not generate unnecessary URL noise.
test("P: default/empty state produces a clean empty URL", () => {
  const params = buildSearchParams(EMPTY_STATE);
  assert.equal(params.toString(), "");
  // Parsing an empty URL returns the same canonical defaults.
  const parsed = parseShopState(new URLSearchParams());
  assert.equal(parsed.query, "");
  assert.equal(parsed.sort, "newest");
  assert.equal(parsed.newIn, false);
  assert.equal(parsed.discovery, "");
  assert.equal(parsed.min, null);
  assert.equal(parsed.max, null);
  FILTER_DIMENSIONS.forEach(({ key }) => {
    assert.deepEqual(parsed.filters[key], []);
  });
});
