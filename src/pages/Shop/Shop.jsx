import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProductGrid from "../../components/product/ProductGrid";
import DiscoveryModule from "../../components/discovery/DiscoveryModule";
import ShopFilters from "../../components/shop/ShopFilters";
import FilterDrawer from "../../components/shop/FilterDrawer";
import FilterChips from "../../components/shop/FilterChips";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import { useCatalogue } from "../../hooks/useCatalogue";
import { useBatchSize } from "../../hooks/useBatchSize";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import {
  approvedOccasionPlaceholders,
  buildOccasionDiscovery,
  fetchDiscoveryModule,
} from "../../services/content";
import { SAMPLE_PIECES, SAMPLE_PIECES_ENABLED } from "../../services/samplePieces";
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

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { products, isLoading, error, retry } = useCatalogue();
  // Same preview fallback as Home: while there is no real, published
  // catalogue yet, the grid shows the same stand-in pieces (see
  // samplePieces.js) rather than sitting empty — never on a live
  // storefront unless VITE_SHOW_SAMPLE_PIECES is explicitly set.
  const showSamples = SAMPLE_PIECES_ENABLED && !isLoading && (Boolean(error) || products.length === 0);
  const catalogue = showSamples ? SAMPLE_PIECES : products;
  const batchSize = useBatchSize();

  const state = useMemo(() => parseShopState(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(state.query);
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [discovery, setDiscovery] = useState(null);

  const refined = hasActiveRefinements(state) || state.sort !== "newest";

  useDocumentMeta({
    title: "Shop — Universal Dicta Couture",
    description:
      "Timeless styles for every occasion. Tradition, elegance and modern sophistication.",
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
    return () => {
      active = false;
    };
  }, []);

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
  const facets = useMemo(() => buildFacets(catalogue, state), [catalogue, state]);
  const chips = useMemo(() => buildChips(state), [state]);

  // Same fallback chain as Home: admin-managed module, then whatever
  // occasions genuinely exist in the published catalogue, then the
  // approved occasions with stand-in photography — so Shop By never
  // sits empty before real products or real photos exist.
  const discoveryModule =
    discovery ?? buildOccasionDiscovery(products, "Shop By") ?? approvedOccasionPlaceholders("Shop By");
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
        <p className="shop__lede">
          Timeless styles for every occasion. Tradition, elegance and modern sophistication.
        </p>
        <p className="shop__help">
          Need help choosing?{" "}
          <Link className="link" to="/chats">
            Chat with Dicta Couturier
          </Link>
        </p>
      </div>

      {discoveryModule ? (
        <div className="container shop__discovery">
          <DiscoveryModule module={discoveryModule} />
        </div>
      ) : null}

      <div className="container shop__layout">
        <aside className="shop__sidebar" aria-label="Filters">
          {filterPanel}
        </aside>

        <section className="shop__results" aria-label="Products">
          <div className="shop__toolbar">
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

            <div className="shop__controls">
              <button
                type="button"
                className="btn btn--secondary shop__filter-button"
                onClick={() => setIsDrawerOpen(true)}
                aria-haspopup="dialog"
              >
                Filter{chips.length ? ` (${chips.length})` : ""}
              </button>

              <div className="shop__sort">
                <label className="visually-hidden" htmlFor="shop-sort">
                  Sort by
                </label>
                <select
                  id="shop-sort"
                  className="form-control"
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
            </div>
          </div>

          <FilterChips chips={chips} onRemove={removeChip} onClearAll={clearAll} />

          <p className="shop__count" role="status" aria-live="polite">
            {isLoading
              ? "Loading pieces…"
              : !showSamples && error
                ? ""
                : `${results.length} ${results.length === 1 ? "piece" : "pieces"}`}
          </p>

          {isLoading ? <LoadingSpinner label="Loading the collection" /> : null}

          {!isLoading && !showSamples && error ? (
            <div className="shop__state">
              <p>{error}</p>
              <button type="button" className="btn btn--primary" onClick={retry}>
                Try again
              </button>
            </div>
          ) : null}

          {!isLoading && !showSamples && !error && products.length === 0 ? (
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
              <ProductGrid products={visible} label="Shop results" />
              {showSamples ? (
                <p className="shop__count shop__preview-note">
                  Preview pieces. Your real pieces replace these as soon as they are published.
                </p>
              ) : null}
              {remaining > 0 ? (
                <div className="shop__load-more">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setVisibleCount((count) => count + batchSize)}
                  >
                    Load More Pieces
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
