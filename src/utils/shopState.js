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

import { FILTER_DIMENSIONS } from "../services/productModel.js";
import { matchesQuery } from "./search.js";

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
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
};

function uniqueTextValues(values = []) {
  const seen = new Set();
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Clone the canonical Shop state before creating a mobile filter draft. */
export function copyShopState(source = EMPTY_STATE) {
  return {
    ...source,
    filters: Object.fromEntries(
      DIMENSION_KEYS.map((key) => [key, [...(source.filters?.[key] ?? [])]])
    ),
    shopBy: Object.fromEntries(
      Object.entries(source.shopBy || {}).map(([key, values]) => [key, [...values]])
    ),
  };
}

/** Toggle one value without mutating the committed state object. */
export function toggleFilterValue(source, dimension, value) {
  if (!DIMENSION_KEYS.includes(dimension)) return copyShopState(source);
  const current = source.filters?.[dimension] ?? [];
  const nextValues = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
  return {
    ...source,
    filters: { ...source.filters, [dimension]: nextValues },
  };
}

/** Refinements represented by controls inside the filter sidebar/sheet. */
export function hasFilterSelections(state) {
  return Boolean(
    state?.newIn ||
      (state?.min !== null && state?.min !== undefined) ||
      (state?.max !== null && state?.max !== undefined) ||
      DIMENSION_KEYS.some((key) => (state?.filters?.[key] ?? []).length > 0)
  );
}

/**
 * Clear only controls that exist inside the filter surface. Search, sort and
 * Discovery remain intact because a mobile Clear All must not erase context
 * the customer cannot see or edit inside that sheet.
 */
export function clearFilterSelections(source) {
  return {
    ...source,
    filters: Object.fromEntries(DIMENSION_KEYS.map((key) => [key, []])),
    min: null,
    max: null,
    newIn: false,
  };
}

/** Primary result-band Clear All: clear every committed refinement, keep Sort. */
export function clearAllRefinements(source) {
  return {
    ...clearFilterSelections(source),
    query: "",
    shopBy: {},
    discovery: "",
  };
}

/** Commit only filter-sheet-owned fields back into the latest canonical state. */
export function applyFilterDraft(committed, draft) {
  return {
    ...committed,
    filters: Object.fromEntries(
      DIMENSION_KEYS.map((key) => [key, [...(draft.filters?.[key] ?? [])]])
    ),
    min: draft.min ?? null,
    max: draft.max ?? null,
    newIn: draft.newIn === true,
  };
}

function toPrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Validate draft price inputs before they are allowed into canonical Shop state. */
export function validatePriceRange(minInput, maxInput) {
  const parse = (value) => {
    if (value === null || value === undefined || value === "") return { value: null, error: "" };
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return { value: null, error: "Enter prices as numbers." };
    if (parsed < 0) return { value: null, error: "Prices cannot be negative." };
    return { value: parsed, error: "" };
  };

  const min = parse(minInput);
  const max = parse(maxInput);
  const error = min.error || max.error ||
    (min.value !== null && max.value !== null && min.value > max.value
      ? "Minimum Price must not exceed Maximum Price."
      : "");

  return { min: min.value, max: max.value, error };
}

export function parseShopState(searchParams) {
  const filters = {};
  DIMENSION_KEYS.forEach((key) => {
    filters[key] = uniqueTextValues(searchParams.getAll(key))
      .filter((value) => !(key === "style" && value.toLowerCase() === "custom style"));
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
    shopBy[group] = uniqueTextValues([...(shopBy[group] || []), value]);
  });

  // Promote shopby entries whose group key is a canonical filter dimension
  // (e.g. shopby=occasion:Wedding) into the filters map instead.  This
  // eliminates dual-representation when a URL contains both ?occasion=X and
  // ?shopby=occasion:X, so buildSearchParams always writes the canonical form.
  Object.keys(shopBy).forEach((group) => {
    if (DIMENSION_KEYS.includes(group)) {
      filters[group] = uniqueTextValues([...(filters[group] ?? []), ...(shopBy[group] ?? [])]);
      delete shopBy[group];
    }
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
  };
}

export function buildSearchParams(state) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);

  DIMENSION_KEYS.forEach((key) => {
    uniqueTextValues(state.filters?.[key] ?? [])
      .filter((value) => !(key === "style" && value.toLowerCase() === "custom style"))
      .forEach((value) => params.append(key, value));
  });

  Object.entries(state.shopBy ?? {}).forEach(([group, values]) => {
    uniqueTextValues(values).forEach((value) => params.append("shopby", `${group}:${value}`));
  });

  if (state.min !== null && state.min !== undefined) params.set("min", String(state.min));
  if (state.max !== null && state.max !== undefined) params.set("max", String(state.max));
  if (state.sort && state.sort !== "newest") params.set("sort", state.sort);
  if (state.newIn) params.set("newin", "1");
  if (state.discovery) params.set("discovery", state.discovery);

  return params;
}

export function hasActiveRefinements(state) {
  return Boolean(
    state.query ||
      state.newIn ||
      state.discovery ||
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
        if (!label || (dimension.key === "style" && label.toLowerCase() === "custom style")) return;
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
      if (!label || (dimension.key === "style" && label.toLowerCase() === "custom style")) return;
      const lower = label.toLowerCase();
      if (lowerToLabel.has(lower)) return;
      lowerToLabel.set(lower, label);
      if (!counts.has(label)) counts.set(label, 0);
    });

    const selected = state.filters?.[dimension.key] ?? [];
    selected.forEach((value) => {
      const trimmed = String(value ?? "").trim();
      if (!trimmed || (dimension.key === "style" && trimmed.toLowerCase() === "custom style")) return;
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

/** Every active refinement/context as a removable chip. */
export function buildChips(state, { discoveryLabel = "" } = {}) {
  const chips = [];

  if (state.query) {
    chips.push({ id: "q", label: `Search: ${state.query}`, text: `“${state.query}”`, type: "query" });
  }

  if (state.newIn) {
    chips.push({ id: "newin", label: "New In", text: "New In", type: "newIn" });
  }

  if (state.discovery) {
    const label = discoveryLabel || state.discovery;
    chips.push({
      id: "discovery",
      label: `Shop By: ${label}`,
      text: `Shop By: ${label}`,
      type: "discovery",
    });
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
    let priceText = "Price range";
    if (state.min !== null && state.max !== null) {
      priceText = `₦${state.min.toLocaleString()} – ₦${state.max.toLocaleString()}`;
    } else if (state.min !== null) {
      priceText = `From ₦${state.min.toLocaleString()}`;
    } else if (state.max !== null) {
      priceText = `Up to ₦${state.max.toLocaleString()}`;
    }
    chips.push({ id: "price", label: `Price: ${priceText}`, text: priceText, type: "price" });
  }

  return chips;
}

/** Remove exactly one active chip while preserving every other valid state. */
export function removeShopRefinement(state, chip) {
  if (!chip) return copyShopState(state);
  if (chip.type === "query") return { ...state, query: "" };
  if (chip.type === "newIn") return { ...state, newIn: false };
  if (chip.type === "discovery") return { ...state, discovery: "" };
  if (chip.type === "price") return { ...state, min: null, max: null };
  if (chip.type === "shopBy") {
    const current = state.shopBy?.[chip.group] ?? [];
    const values = current.filter((entry) => entry !== chip.value);
    const shopBy = { ...(state.shopBy || {}) };
    if (values.length) shopBy[chip.group] = values;
    else delete shopBy[chip.group];
    return { ...state, shopBy };
  }
  if (chip.type === "dimension") {
    const current = state.filters?.[chip.dimension] ?? [];
    return {
      ...state,
      filters: {
        ...state.filters,
        [chip.dimension]: current.filter((entry) => entry !== chip.value),
      },
    };
  }
  return copyShopState(state);
}

