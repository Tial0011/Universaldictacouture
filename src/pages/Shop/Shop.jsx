import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProductGrid from "../../components/product/ProductGrid";
import DiscoveryModule from "../../components/discovery/DiscoveryModule";
import ShopFilters from "../../components/shop/ShopFilters";
import FilterDrawer from "../../components/shop/FilterDrawer";
import FilterChips from "../../components/shop/FilterChips";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import {
  ChevronDownIcon,
  GridViewIcon,
  ListViewIcon,
  SlidersIcon,
} from "../../components/shop/ShopIcons";
import { useCatalogue } from "../../hooks/useCatalogue";
import { useBatchSize } from "../../hooks/useBatchSize";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import {
  buildShopDiscovery,
  fetchDiscoveryModule,
  fetchTaxonomyLabels,
} from "../../services/content";
import { FILTER_DIMENSIONS } from "../../services/productModel";
import {
  SORT_OPTIONS,
  applyShopState,
  buildChips,
  buildFacets,
  buildSearchParams,
  hasActiveRefinements,
  parseShopState,
} from "../../utils/shopState";
import "./Shop.css";

const SHOP_LEDE = "Premium Aso Oke fabrics for life\u2019s most meaningful moments.";
const SHOP_TAGLINE = "Authentic heritage. Timeless beauty. Endless possibilities.";

const DIMENSION_KEYS = FILTER_DIMENSIONS.map((dimension) => dimension.key);

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { products, isLoading, error, retry } = useCatalogue();
  const catalogue = products;
  const batchSize = useBatchSize();

  const state = useMemo(() => parseShopState(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(state.query);
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [discovery, setDiscovery] = useState(null);
  const [taxonomy, setTaxonomy] = useState(null);

  // The header's Search icon lands here with ?focus=search. Search is
  // otherwise tucked away (the header already carries it), so the field
  // appears when asked for, or whenever a search is active.
  const searchRequested = searchParams.get("focus") === "search";
  const [searchOpen, setSearchOpen] = useState(searchRequested);
  const searchInputRef = useRef(null);
  const showSearch = searchOpen || Boolean(state.query);

  const refined = hasActiveRefinements(state) || state.sort !== "newest" || state.view !== "grid";

  useDocumentMeta({
    title: "Shop — Universal Dicta Couture",
    description: SHOP_LEDE,
    // Refinements share the Shop's canonical and are not indexed
    // separately, so no duplicate SEO pages are created.
    canonicalPath: "/shop",
    noindex: refined,
  });

  useEffect(() => {
    let active = true;
    fetchDiscoveryModule("shop").then((module) => {
      if (active && module) setDiscovery(module);
    });
    fetchTaxonomyLabels().then((labels) => {
      if (active) setTaxonomy(labels);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (searchRequested) setSearchOpen(true);
  }, [searchRequested]);

  useEffect(() => {
    if (searchOpen && searchRequested) searchInputRef.current?.focus();
  }, [searchOpen, searchRequested]);

  // Keep the search box in step with the URL (Back/Forward, chips).
  useEffect(() => {
    setSearchDraft(state.query);
  }, [state.query]);

  // A new refinement or a viewport change restarts the batch.
  useEffect(() => {
    setVisibleCount(batchSize);
  }, [batchSize, searchParams]);

  const updateState = useCallback(
    (next) => {
      setSearchParams(buildSearchParams(next));
    },
    [setSearchParams]
  );

  const toggleValue = useCallback(
    (dimension, value) => {
      const current = state.filters[dimension] ?? [];
      const nextValues = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      updateState({ ...state, filters: { ...state.filters, [dimension]: nextValues } });
    },
    [state, updateState]
  );

  const removeChip = useCallback(
    (chip) => {
      if (chip.type === "query") updateState({ ...state, query: "" });
      else if (chip.type === "newIn") updateState({ ...state, newIn: false });
      else if (chip.type === "price") updateState({ ...state, min: null, max: null });
      else toggleValue(chip.dimension, chip.value);
    },
    [state, updateState, toggleValue]
  );

  const clearAll = useCallback(() => {
    updateState({
      ...state,
      query: "",
      filters: Object.fromEntries(Object.keys(state.filters).map((key) => [key, []])),
      min: null,
      max: null,
      newIn: false,
    });
  }, [state, updateState]);

  const results = useMemo(() => applyShopState(catalogue, state), [catalogue, state]);
  const facets = useMemo(() => buildFacets(catalogue, state, taxonomy), [catalogue, state, taxonomy]);
  const chips = useMemo(() => buildChips(state), [state]);

  // Discovery comes from published content or real product attributes.
  const discoveryModule = useMemo(
    () =>
      discovery ?? buildShopDiscovery(catalogue, "Shop By"),
    [discovery, catalogue]
  );

  // A tile adds its filter to what is already applied (a Colour and an
  // Occasion can be combined) rather than starting the search over.
  const resolveTileDestination = useCallback(
    (item) => {
      const [path, queryString = ""] = item.destination.split("?");
      if (path !== "/shop") return item.destination;

      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      new URLSearchParams(queryString).forEach((value, key) => {
        if (DIMENSION_KEYS.includes(key)) {
          if (!next.getAll(key).includes(value)) next.append(key, value);
        } else {
          next.set(key, value);
        }
      });
      const query = next.toString();
      return query ? `${path}?${query}` : path;
    },
    [searchParams]
  );
  const visible = results.slice(0, visibleCount);
  const remaining = results.length - visible.length;

  const filterPanel = (
    <ShopFilters
      facets={facets}
      state={state}
      onToggleValue={toggleValue}
      onToggleNewIn={(checked) => updateState({ ...state, newIn: checked })}
      onPriceChange={(min, max) => updateState({ ...state, min, max })}
      onClearAll={clearAll}
      hasRefinements={hasActiveRefinements(state)}
    />
  );

  return (
    <div className="shop">
      <div className="container shop__intro">
        <nav className="shop__breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <Link to="/">Home</Link>
            </li>
            <li aria-current="page">Shop</li>
          </ol>
        </nav>

        <h1 className="shop__title">Shop</h1>
        <p className="shop__lede">{SHOP_LEDE}</p>
        <p className="shop__tagline">{SHOP_TAGLINE}</p>
      </div>

      {discoveryModule ? (
        <div className="container shop__discovery">
          <DiscoveryModule
            module={discoveryModule}
            className="discovery--shop"
            hideTitleWithTabs
            resolveDestination={resolveTileDestination}
          />
        </div>
      ) : null}

      <div className="container shop__layout">
        <aside className="shop__sidebar" aria-label="Filters">
          {filterPanel}
        </aside>

        <section className="shop__results" aria-label="Products">
          <div className="shop__toolbar">
            {showSearch ? (
              <form
                className="shop__search"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  updateState({ ...state, query: searchDraft.trim() });
                }}
              >
                <label className="visually-hidden" htmlFor="shop-search">
                  Product Search
                </label>
                <input
                  id="shop-search"
                  ref={searchInputRef}
                  className="form-control"
                  type="search"
                  value={searchDraft}
                  placeholder="Search pieces, fabrics, occasions"
                  onChange={(event) => setSearchDraft(event.target.value)}
                />
                <button type="submit" className="btn btn--secondary shop__search-submit">
                  Search
                </button>
              </form>
            ) : null}

            <div className="shop__controls">
              <button
                type="button"
                className="shop__filter-button"
                onClick={() => setIsDrawerOpen(true)}
                aria-haspopup="dialog"
              >
                <SlidersIcon size={20} />
                <span>Filters{chips.length ? ` (${chips.length})` : ""}</span>
              </button>

              <div className="shop__sort">
                <label className="visually-hidden" htmlFor="shop-sort">
                  Sort by
                </label>
                {/* The visible text is drawn here; the native select sits
                    invisibly over it so the OS picker (and 16px text, which
                    stops iOS zooming in) still does the choosing. */}
                <span className="shop__sort-face" aria-hidden="true">
                  <span className="shop__sort-prefix">Sort:</span>
                  <span className="shop__sort-value">
                    {SORT_OPTIONS.find((option) => option.value === state.sort)?.label}
                  </span>
                  <ChevronDownIcon size={18} />
                </span>
                <select
                  id="shop-sort"
                  className="shop__sort-select"
                  value={state.sort}
                  onChange={(event) => updateState({ ...state, sort: event.target.value })}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="shop__view" role="group" aria-label="Layout">
                <button
                  type="button"
                  className={`shop__view-button${state.view === "grid" ? " is-active" : ""}`}
                  aria-pressed={state.view === "grid"}
                  aria-label="Grid view"
                  onClick={() => updateState({ ...state, view: "grid" })}
                >
                  <GridViewIcon size={20} />
                </button>
                <button
                  type="button"
                  className={`shop__view-button${state.view === "list" ? " is-active" : ""}`}
                  aria-pressed={state.view === "list"}
                  aria-label="List view"
                  onClick={() => updateState({ ...state, view: "list" })}
                >
                  <ListViewIcon size={20} />
                </button>
              </div>
            </div>
          </div>

          <FilterChips chips={chips} onRemove={removeChip} onClearAll={clearAll} />

          {/* Read out to assistive tech as results change; shown on screen
              only when there is a message to give (loading, none found). */}
          <p
            className={`shop__count${isLoading || results.length === 0 ? "" : " visually-hidden"}`}
            role="status"
            aria-live="polite"
          >
            {isLoading
              ? "Loading pieces…"
              : error
                ? ""
                : `${results.length} ${results.length === 1 ? "piece" : "pieces"}`}
          </p>

          {isLoading ? <LoadingSpinner label="Loading the collection" /> : null}

          {!isLoading && error ? (
            <div className="shop__state">
              <p>{error}</p>
              <button type="button" className="btn btn--primary" onClick={retry}>
                Try again
              </button>
            </div>
          ) : null}

          {!isLoading && !error && products.length === 0 ? (
            <div className="shop__state">
              <p>No pieces have been published yet. Please check back soon.</p>
            </div>
          ) : null}

          {!isLoading && catalogue.length > 0 && results.length === 0 ? (
            <div className="shop__state">
              <p>
                {state.query
                  ? `Nothing matches “${state.query}” with the current filters.`
                  : "Nothing matches these filters."}
              </p>
              <button type="button" className="btn btn--secondary" onClick={clearAll}>
                Clear All
              </button>
            </div>
          ) : null}

          {visible.length > 0 ? (
            <>
              <ProductGrid products={visible} view={state.view} label="Shop results" />
              {remaining > 0 ? (
                <div className="shop__load-more">
                  <button
                    type="button"
                    className="shop__load-more-button"
                    onClick={() => setVisibleCount((count) => count + batchSize)}
                  >
                    <span>Load More Pieces</span>
                    <ChevronDownIcon size={18} />
                  </button>
                  <p className="shop__count">
                    Showing {visible.length} of {results.length}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>

      <FilterDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        {filterPanel}
      </FilterDrawer>
    </div>
  );
}
