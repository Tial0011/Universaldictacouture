/**
 * Shop state: search, filters, price range, sort, New In and the
 * discovery selection.
 *
 * The URL is the single source of truth, so any Shop view can be
 * shared or restored and browser Back/Forward move between states
 * naturally. Parsing is deliberately forgiving — an unknown sort key
 * or a nonsense price falls back to the default instead of producing
 * an empty screen.
 */

import { FILTER_DIMENSIONS } from "../services/productModel";
import { matchesQuery } from "./search";

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "price-asc", label: "Price Low to High" },
  { value: "price-desc", label: "Price High to Low" },
];

const SORT_VALUES = SORT_OPTIONS.map((option) => option.value);
const DIMENSION_KEYS = FILTER_DIMENSIONS.map((dimension) => dimension.key);

export const EMPTY_STATE = {
  query: "",
  filters: Object.fromEntries(DIMENSION_KEYS.map((key) => [key, []])),
  shopBy: {},
  min: null,
  max: null,
  sort: "newest",
  newIn: false,
  discovery: "",
  view: "grid",
};

function toPrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseShopState(searchParams) {
  const filters = {};
  DIMENSION_KEYS.forEach((key) => {
    filters[key] = searchParams.getAll(key).map((value) => value.trim()).filter(Boolean);
  });

  let min = toPrice(searchParams.get("min"));
  let max = toPrice(searchParams.get("max"));
  // A reversed range is a mistake, not a query — swap rather than
  // returning nothing.
  if (min !== null && max !== null && min > max) {
    [min, max] = [max, min];
  }

  const sort = searchParams.get("sort");
  const shopBy = {};
  searchParams.getAll("shopby").forEach((entry) => {
    const separator = entry.indexOf(":");
    if (separator <= 0) return;
    const group = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (!group || !value) return;
    shopBy[group] = shopBy[group] || [];
    if (!shopBy[group].includes(value)) shopBy[group].push(value);
  });

  return {
    query: (searchParams.get("q") ?? "").trim(),
    filters,
    shopBy,
    min,
    max,
    sort: SORT_VALUES.includes(sort) ? sort : "newest",
    newIn: searchParams.get("newin") === "1",
    discovery: (searchParams.get("discovery") ?? "").trim(),
    // Grid is the default; only the list view is written to the URL.
    view: searchParams.get("view") === "list" ? "list" : "grid",
  };
}

export function buildSearchParams(state) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);

  DIMENSION_KEYS.forEach((key) => {
    (state.filters?.[key] ?? []).forEach((value) => params.append(key, value));
  });

  Object.entries(state.shopBy ?? {}).forEach(([group, values]) => {
    values.forEach((value) => params.append("shopby", `${group}:${value}`));
  });

  if (state.min !== null && state.min !== undefined) params.set("min", String(state.min));
  if (state.max !== null && state.max !== undefined) params.set("max", String(state.max));
  if (state.sort && state.sort !== "newest") params.set("sort", state.sort);
  if (state.newIn) params.set("newin", "1");
  if (state.discovery) params.set("discovery", state.discovery);
  if (state.view === "list") params.set("view", "list");

  return params;
}

export function hasActiveRefinements(state) {
  return Boolean(
    state.query ||
      state.newIn ||
      state.min !== null ||
      state.max !== null ||
      DIMENSION_KEYS.some((key) => (state.filters?.[key] ?? []).length > 0) ||
      Object.values(state.shopBy ?? {}).some((values) => values.length > 0)
  );
}

function matchesDimension(product, key, selected) {
  if (!selected.length) return true;
  // OR within a dimension.
  return selected.some((value) =>
    (product[key] ?? []).some((candidate) => candidate.toLowerCase() === value.toLowerCase())
  );
}

function matchesShopBy(product, selectedByGroup = {}) {
  return Object.entries(selectedByGroup).every(([group, selected]) => {
    if (!selected?.length) return true;
    const values = product.shopBy?.[group] ?? [];
    return selected.some((value) =>
      values.some((candidate) => candidate.toLowerCase() === value.toLowerCase())
    );
  });
}

function matchesPrice(product, min, max) {
  // A piece matches when any of its prices falls inside the range.
  if (min !== null && product.maxPrice < min) return false;
  if (max !== null && product.minPrice > max) return false;
  return true;
}

/** AND between dimensions, OR within one, then search and price range. */
export function filterProducts(products, state, { skipDimension } = {}) {
  return products.filter((product) => {
    if (state.newIn && !product.isNewIn) return false;
    if (!matchesPrice(product, state.min, state.max)) return false;
    if (!matchesQuery(product.searchText, state.query)) return false;
    if (!matchesShopBy(product, state.shopBy)) return false;
    return DIMENSION_KEYS.every((key) =>
      key === skipDimension ? true : matchesDimension(product, key, state.filters?.[key] ?? [])
    );
  });
}

export function sortProducts(products, sort) {
  const sorted = [...products];
  if (sort === "price-asc") {
    return sorted.sort((a, b) => a.minPrice - b.minPrice || a.name.localeCompare(b.name));
  }
  if (sort === "price-desc") {
    return sorted.sort((a, b) => b.minPrice - a.minPrice || a.name.localeCompare(b.name));
  }
  // Newest First means first published, never last edited.
  return sorted.sort((a, b) => {
    const aTime = a.publishedAt ? a.publishedAt.getTime() : 0;
    const bTime = b.publishedAt ? b.publishedAt.getTime() : 0;
    return bTime - aTime || a.name.localeCompare(b.name);
  });
}

export function applyShopState(products, state) {
  return sortProducts(filterProducts(products, state), state.sort);
}

/**
 * Values available per dimension, counted against every other active
 * refinement, so a filter never offers a choice that leads nowhere.
 * Admin taxonomy labels (taxonomyByDimension) are merged in so an
 * allocation appears even with zero published products behind it.
 * Matching is case-insensitive; product casing wins when both exist.
 */
export function buildFacets(products, state, taxonomyByDimension = null) {
  return FILTER_DIMENSIONS.map((dimension) => {
    const pool = filterProducts(products, state, { skipDimension: dimension.key });
    const counts = new Map();
    const lowerToLabel = new Map();

    const remember = (label, count) => {
      const lower = label.toLowerCase();
      if (lowerToLabel.has(lower)) {
        const existing = lowerToLabel.get(lower);
        counts.set(existing, (counts.get(existing) ?? 0) + count);
        return;
      }
      lowerToLabel.set(lower, label);
      counts.set(label, (counts.get(label) ?? 0) + count);
    };

    pool.forEach((product) => {
      (product[dimension.key] ?? []).forEach((value) => {
        const label = String(value).trim();
        if (!label) return;
        remember(label, 1);
      });
    });

    // Admin allocations: ensure every taxonomy label for this dimension
    // is offered, even when no product in the current pool carries it.
    const taxonomyLabels = Array.isArray(taxonomyByDimension?.[dimension.key])
      ? taxonomyByDimension[dimension.key]
      : [];
    taxonomyLabels.forEach((raw) => {
      const label = String(raw ?? "").trim();
      if (!label) return;
      const lower = label.toLowerCase();
      if (lowerToLabel.has(lower)) return;
      lowerToLabel.set(lower, label);
      if (!counts.has(label)) counts.set(label, 0);
    });

    const selected = state.filters?.[dimension.key] ?? [];
    selected.forEach((value) => {
      const trimmed = String(value ?? "").trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (lowerToLabel.has(lower)) return;
      lowerToLabel.set(lower, trimmed);
      if (!counts.has(trimmed)) counts.set(trimmed, 0);
    });

    return {
      ...dimension,
      values: [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true })),
    };
  }).filter((dimension) => dimension.values.length > 0);
}

/** Every active refinement as a removable chip. */
export function buildChips(state) {
  const chips = [];

  if (state.query) {
    chips.push({ id: "q", label: `Search: ${state.query}`, text: `“${state.query}”`, type: "query" });
  }

  if (state.newIn) {
    chips.push({ id: "newin", label: "New In", text: "New In", type: "newIn" });
  }

  FILTER_DIMENSIONS.forEach((dimension) => {
    (state.filters?.[dimension.key] ?? []).forEach((value) => {
      chips.push({
        id: `${dimension.key}:${value}`,
        // `label` is the full name (used for assistive tech); `text` is
        // what the chip shows, since the row is already headed
        // "Active Filters:".
        label: `${dimension.label}: ${value}`,
        text: value,
        type: "dimension",
        dimension: dimension.key,
        value,
      });
    });
  });

  Object.entries(state.shopBy ?? {}).forEach(([group, values]) => {
    values.forEach((value) => {
      chips.push({
        id: `shopby:${group}:${value}`,
        label: `Shop By ${group}: ${value}`,
        text: value,
        type: "shopBy",
        group,
        value,
      });
    });
  });

  if (state.min !== null || state.max !== null) {
    chips.push({ id: "price", label: "Price range", text: "Price range", type: "price" });
  }

  return chips;
}
