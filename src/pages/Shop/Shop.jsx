import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import ProductGrid from "../../components/product/ProductGrid";
import DiscoveryModule from "../../components/discovery/DiscoveryModule";
import ShopFilters from "../../components/shop/ShopFilters";
import FilterDrawer from "../../components/shop/FilterDrawer";
import FilterChips from "../../components/shop/FilterChips";
import {
  ChevronDownIcon,
  SlidersIcon,
} from "../../components/shop/ShopIcons";
import { useCatalogue } from "../../hooks/useCatalogue";
import { useBatchSize } from "../../hooks/useBatchSize";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import {
  buildShopDiscovery,
  fetchTaxonomyLabels,
} from "../../services/content";
import { DEFAULT_SHOP_BY_GROUPS, fetchShopByGroups } from "../../services/shopBy";
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

const SHOP_LEDE = "Timeless styles for every occasion. Tradition, elegance and modern sophistication.";
const DIMENSION_KEYS = FILTER_DIMENSIONS.map((dimension) => dimension.key);
const SHOP_RETURN_KEY = "udc:shop:return-position";

function readShopReturn(path) {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SHOP_RETURN_KEY) || "null");
    if (!parsed || parsed.path !== path) return null;
    const scrollY = Number(parsed.scrollY);
    const visibleCount = Number(parsed.visibleCount);
    return {
      path,
      scrollY: Number.isFinite(scrollY) && scrollY >= 0 ? scrollY : 0,
      visibleCount: Number.isFinite(visibleCount) && visibleCount > 0 ? visibleCount : null,
    };
  } catch {
    return null;
  }
}

function clearShopReturn() {
  try { sessionStorage.removeItem(SHOP_RETURN_KEY); } catch { /* blocked storage */ }
}

function ChatIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.8 8.8 0 0 1-3.3-.7L4 20l1.5-4.1A7.2 7.2 0 0 1 4.5 12 7.5 7.5 0 0 1 12 4.5a7.5 7.5 0 0 1 8 7Z" />
      <path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" />
    </svg>
  );
}

function copyShopState(source) {
  return {
    ...source,
    filters: Object.fromEntries(
      Object.entries(source.filters || {}).map(([key, values]) => [key, [...values]])
    ),
    shopBy: Object.fromEntries(
      Object.entries(source.shopBy || {}).map(([key, values]) => [key, [...values]])
    ),
  };
}

function clearedShopState(source) {
  return {
    ...source,
    query: "",
    filters: Object.fromEntries(DIMENSION_KEYS.map((key) => [key, []])),
    shopBy: {},
    min: null,
    max: null,
    newIn: false,
    discovery: "",
  };
}

function toggleDimension(source, dimension, value) {
  const current = source.filters?.[dimension] ?? [];
  const nextValues = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
  return {
    ...source,
    filters: { ...source.filters, [dimension]: nextValues },
  };
}

function SortControl({ value, onChange }) {
  return (
    <div className="shop__sort">
      <label className="visually-hidden" htmlFor="shop-sort">Sort by</label>
      <span className="shop__sort-face" aria-hidden="true">
        <span className="shop__sort-prefix">Sort:</span>
        <span className="shop__sort-value">
          {SORT_OPTIONS.find((option) => option.value === value)?.label}
        </span>
        <ChevronDownIcon size={18} />
      </span>
      <select
        id="shop-sort"
        className="shop__sort-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function ShopSkeleton() {
  return (
    <ul className="product-grid shop-skeleton" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <li key={index}>
          <div className="shop-skeleton__card">
            <span className="shop-skeleton__media" />
            <span className="shop-skeleton__line shop-skeleton__line--name" />
            <span className="shop-skeleton__line shop-skeleton__line--price" />
            <span className="shop-skeleton__button" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { products, isLoading, error, retry } = useCatalogue();
  const catalogue = products;
  const batchSize = useBatchSize();

  const state = useMemo(() => parseShopState(searchParams), [searchParams]);
  const searchKey = searchParams.toString();
  const currentShopPath = `/shop${location.search}`;
  const [returnSnapshot] = useState(() => readShopReturn(currentShopPath));
  const restoredCount = Number(location.state?.restoreVisibleCount ?? returnSnapshot?.visibleCount);
  const [searchDraft, setSearchDraft] = useState(() => String(location.state?.shopSearchDraft || state.query || ""));
  const [visibleCount, setVisibleCount] = useState(() => Number.isFinite(restoredCount) ? Math.max(batchSize, restoredCount) : batchSize);
  const [loadAnnouncement, setLoadAnnouncement] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerState, setDrawerState] = useState(() => copyShopState(state));
  const [drawerFiltersValid, setDrawerFiltersValid] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const resultsRef = useRef(null);
  const [shopByGroups, setShopByGroups] = useState(DEFAULT_SHOP_BY_GROUPS);
  const [taxonomy, setTaxonomy] = useState(null);

  const searchRequested = searchParams.get("focus") === "search";
  const [searchOpen, setSearchOpen] = useState(searchRequested);
  const searchInputRef = useRef(null);
  const showSearch = searchOpen || Boolean(state.query);
  const refined = hasActiveRefinements(state) || state.sort !== "newest";

  useDocumentMeta({
    title: "Shop — Universal Dicta Couture",
    description: SHOP_LEDE,
    canonicalPath: "/shop",
    noindex: refined,
  });

  useEffect(() => {
    let active = true;
    Promise.all([fetchShopByGroups(), fetchTaxonomyLabels()]).then(([groups, labels]) => {
      if (!active) return;
      if (groups.length) setShopByGroups(groups);
      setTaxonomy(labels);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (searchRequested) setSearchOpen(true);
  }, [searchRequested]);

  useEffect(() => {
    if (searchOpen && searchRequested) searchInputRef.current?.focus();
  }, [searchOpen, searchRequested]);

  useEffect(() => {
    setSearchDraft(state.query);
  }, [state.query]);

  // A changed public Shop state restarts progressive loading. Returning
  // from Product Details may explicitly restore the previous loaded depth.
  useEffect(() => {
    const restore = Number(location.state?.restoreVisibleCount ?? returnSnapshot?.visibleCount);
    setVisibleCount(Number.isFinite(restore) ? Math.max(batchSize, restore) : batchSize);
    setLoadAnnouncement("");
  }, [batchSize, searchKey, location.state?.restoreVisibleCount, returnSnapshot?.visibleCount]);

  useEffect(() => {
    if (isLoading || !returnSnapshot || returnSnapshot.path !== currentShopPath) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: returnSnapshot.scrollY, left: 0, behavior: "auto" });
      clearShopReturn();
    });
    return () => cancelAnimationFrame(frame);
  }, [currentShopPath, isLoading, returnSnapshot]);

  const updateState = useCallback((next, { replace = false } = {}) => {
    setSearchParams(buildSearchParams(next), { replace });
  }, [setSearchParams]);

  const toggleValue = useCallback((dimension, value) => {
    updateState(toggleDimension(state, dimension, value));
  }, [state, updateState]);

  const toggleShopBy = useCallback((group, value) => {
    const current = state.shopBy?.[group] ?? [];
    const nextValues = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    updateState({ ...state, shopBy: { ...(state.shopBy || {}), [group]: nextValues } });
  }, [state, updateState]);

  const removeChip = useCallback((chip) => {
    if (chip.type === "query") updateState({ ...state, query: "" });
    else if (chip.type === "newIn") updateState({ ...state, newIn: false });
    else if (chip.type === "price") updateState({ ...state, min: null, max: null });
    else if (chip.type === "shopBy") toggleShopBy(chip.group, chip.value);
    else toggleValue(chip.dimension, chip.value);
  }, [state, updateState, toggleShopBy, toggleValue]);

  const clearAll = useCallback(() => {
    updateState(clearedShopState(state));
  }, [state, updateState]);

  const results = useMemo(() => applyShopState(catalogue, state), [catalogue, state]);
  const facets = useMemo(() => buildFacets(catalogue, state, taxonomy), [catalogue, state, taxonomy]);
  const chips = useMemo(() => buildChips(state), [state]);

  const discoveryModule = useMemo(
    () => buildShopDiscovery(catalogue, "Shop By", shopByGroups),
    [catalogue, shopByGroups]
  );

  const activeDiscoveryGroup = discoveryModule?.groups?.some((group) => group.id === state.discovery)
    ? state.discovery
    : (discoveryModule?.groups?.[0]?.id ?? "");

  const resolveTileDestination = useCallback((item) => {
    const [path, queryString = ""] = item.destination.split("?");
    if (path !== "/shop") return item.destination;

    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    if (item.group) next.set("discovery", item.group);
    new URLSearchParams(queryString).forEach((value, key) => {
      if (DIMENSION_KEYS.includes(key) || key === "shopby") {
        if (!next.getAll(key).includes(value)) next.append(key, value);
      } else {
        next.set(key, value);
      }
    });
    const query = next.toString();
    return query ? `${path}?${query}` : path;
  }, [searchParams]);

  const visible = results.slice(0, visibleCount);
  const remaining = Math.max(0, results.length - visible.length);
  const navigationState = useMemo(() => ({
    shopReturn: `/shop${location.search}`,
    shopVisibleCount: visibleCount,
  }), [location.search, visibleCount]);

  const rememberShopPosition = useCallback(() => {
    try {
      sessionStorage.setItem(SHOP_RETURN_KEY, JSON.stringify({
        path: `/shop${location.search}`,
        scrollY: window.scrollY,
        visibleCount,
      }));
    } catch { /* blocked storage */ }
  }, [location.search, visibleCount]);

  const openDrawer = () => {
    setDrawerState(copyShopState(state));
    setDrawerFiltersValid(true);
    setIsDrawerOpen(true);
  };

  const drawerFacets = useMemo(
    () => buildFacets(catalogue, drawerState, taxonomy),
    [catalogue, drawerState, taxonomy]
  );

  const drawerHasRefinements = hasActiveRefinements(drawerState);

  const desktopFilterPanel = (
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

  const drawerFilterPanel = (
    <ShopFilters
      facets={drawerFacets}
      state={drawerState}
      onToggleValue={(dimension, value) => setDrawerState((current) => toggleDimension(current, dimension, value))}
      onToggleNewIn={(checked) => setDrawerState((current) => ({ ...current, newIn: checked }))}
      onPriceChange={(min, max) => setDrawerState((current) => ({ ...current, min, max }))}
      onClearAll={() => setDrawerState((current) => clearedShopState(current))}
      hasRefinements={drawerHasRefinements}
      showClear={false}
      idPrefix="drawer-filters"
      onValidityChange={setDrawerFiltersValid}
    />
  );

  const couturierDraft = useMemo(() => {
    const context = chips.map((chip) => chip.text ?? chip.label).slice(0, 4).join(", ");
    return context
      ? `I’d like help choosing an Aso Oke piece. I’m currently browsing with: ${context}.`
      : "I’d like help choosing an Aso Oke piece from the Shop.";
  }, [chips]);

  return (
    <div className="shop">
      <section className="shop__intro-wrap" aria-labelledby="shop-title">
        <div className="container shop__intro">
          <div className="shop__intro-copy">
            <nav className="shop__breadcrumb" aria-label="Breadcrumb">
              <ol>
                <li><Link to="/">Home</Link></li>
                <li aria-current="page">Shop</li>
              </ol>
            </nav>
            <p className="shop__eyebrow">The fabric collection</p>
            <h1 className="shop__title" id="shop-title">Shop</h1>
            <p className="shop__lede">{SHOP_LEDE}</p>
          </div>

          <aside className="shop__couturier" aria-label="Dicta Couturier assistance">
            <span className="shop__couturier-mark" aria-hidden="true"><ChatIcon size={22} /></span>
            <span className="shop__couturier-copy">
              <strong>Need help choosing?</strong>
              <span>Get personal guidance on fabrics, colours or styles.</span>
            </span>
            <Link className="shop__couturier-link" to="/chats" state={{ draft: couturierDraft }}>
              <ChatIcon size={18} />
              <span>Chat with a Dicta Couturier</span>
              <span aria-hidden="true">→</span>
            </Link>
          </aside>
        </div>
      </section>

      {discoveryModule ? (
        <div className="container shop__discovery">
          <DiscoveryModule
            module={discoveryModule}
            className="discovery--shop"
            hideTitleWithTabs
            activeGroup={activeDiscoveryGroup}
            onGroupChange={(groupId) => updateState({ ...state, discovery: groupId })}
            resolveDestination={resolveTileDestination}
            railControls
            onItemClick={() => {
              requestAnimationFrame(() => {
                resultsRef.current?.scrollIntoView({
                  block: "start",
                  behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                });
              });
            }}
          />
        </div>
      ) : null}

      <div className={`container shop__layout${isSidebarOpen ? "" : " shop__layout--filters-closed"}`}>
        <aside className="shop__sidebar" aria-label="Filters" aria-hidden={!isSidebarOpen}>
          {desktopFilterPanel}
        </aside>

        <section id="shop-results" ref={resultsRef} className="shop__results" aria-label="Product results" aria-busy={isLoading || undefined}>
          {showSearch ? (
            <form
              className="shop__search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                updateState({ ...state, query: searchDraft.trim() });
              }}
            >
              <label className="visually-hidden" htmlFor="shop-search">Search the Shop</label>
              <input
                id="shop-search"
                ref={searchInputRef}
                className="form-control"
                type="search"
                value={searchDraft}
                placeholder="Search fabrics, colours, occasions, styles…"
                onChange={(event) => setSearchDraft(event.target.value)}
              />
              <button type="submit" className="btn btn--secondary shop__search-submit">Search</button>
            </form>
          ) : null}

          <div className="shop__toolbar" aria-label="Catalogue controls">
            <button
              type="button"
              className="shop__filter-button"
              onClick={openDrawer}
              aria-haspopup="dialog"
            >
              <SlidersIcon size={20} />
              <span>Filters</span>
            </button>

            <button
              type="button"
              className="shop__sidebar-toggle"
              aria-expanded={isSidebarOpen}
              onClick={() => setIsSidebarOpen((open) => !open)}
            >
              <SlidersIcon size={18} />
              <span>{isSidebarOpen ? "Hide Filters" : "Show Filters"}</span>
            </button>

            <SortControl value={state.sort} onChange={(sort) => updateState({ ...state, sort })} />
          </div>

          <FilterChips chips={chips} onRemove={removeChip} onClearAll={clearAll} />

          <p className="visually-hidden" role="status" aria-live="polite">
            {isLoading ? "Loading pieces." : error ? "The collection could not be loaded." : results.length === 0 ? "No pieces match the current Shop state." : "Product results updated."}
          </p>
          <p className="visually-hidden" role="status" aria-live="polite">{loadAnnouncement}</p>

          {isLoading ? <ShopSkeleton /> : null}

          {!isLoading && error ? (
            <div className="shop__state shop__state--error">
              <p className="shop__state-kicker">The collection is taking a little longer</p>
              <h2>We couldn’t load the Shop.</h2>
              <p>{error}</p>
              <button type="button" className="btn btn--primary" onClick={retry}>Try again</button>
            </div>
          ) : null}

          {!isLoading && !error && products.length === 0 ? (
            <div className="shop__state">
              <p className="shop__state-kicker">The collection</p>
              <h2>New pieces are being prepared.</h2>
              <p>No fabrics have been published yet. Please check back soon.</p>
            </div>
          ) : null}

          {!isLoading && catalogue.length > 0 && results.length === 0 ? (
            <div className="shop__state shop__state--empty">
              <p className="shop__state-kicker">Refine your search</p>
              <h2>{state.query ? `No match for “${state.query}”` : "No pieces match these refinements"}</h2>
              <p>Keep your current idea, clear the refinements, or ask a Dicta Couturier for help finding the right fabric.</p>
              <div className="shop__state-actions">
                <button type="button" className="btn btn--secondary" onClick={clearAll}>Clear All</button>
                <Link className="btn btn--primary" to="/chats" state={{ draft: couturierDraft }}>Ask a Couturier</Link>
              </div>
            </div>
          ) : null}

          {visible.length > 0 ? (
            <>
              <ProductGrid
                products={visible}
                variant="shop"
                navigationState={navigationState}
                onProductNavigate={rememberShopPosition}
                label="Shop results"
              />
              <div className="shop__load-more">
                {remaining > 0 ? (
                  <button
                    type="button"
                    className="shop__load-more-button"
                    onClick={() => {
                      const added = Math.min(batchSize, remaining);
                      setVisibleCount((count) => count + batchSize);
                      setLoadAnnouncement(`Loaded ${added} more ${added === 1 ? "piece" : "pieces"}.`);
                    }}
                  >
                    <span>Load More Pieces</span>
                    <ChevronDownIcon size={18} />
                  </button>
                ) : (
                  <p className="shop__exhausted">You've shopped all available pieces.</p>
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>

      <FilterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onApply={() => {
          updateState(drawerState);
          setIsDrawerOpen(false);
        }}
        onClearAll={() => setDrawerState((current) => clearedShopState(current))}
        canClear={drawerHasRefinements}
        canApply={drawerFiltersValid}
      >
        {drawerFilterPanel}
      </FilterDrawer>
    </div>
  );
}
