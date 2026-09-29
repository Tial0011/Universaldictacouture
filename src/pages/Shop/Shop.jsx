import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import ProductGrid from "../../components/product/ProductGrid";
import ProductImage from "../../components/product/ProductImage";
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
import { SHOP_SEO } from "../../config/shopSeo";
import {
  buildShopDiscovery,
  fetchTaxonomyLabels,
} from "../../services/content";
import { DEFAULT_SHOP_BY_GROUPS, fetchShopByGroups } from "../../services/shopBy";
import { FILTER_DIMENSIONS } from "../../services/productModel";
import {
  SORT_OPTIONS,
  applyFilterDraft,
  applyShopState,
  buildChips,
  buildFacets,
  buildSearchParams,
  clearAllRefinements,
  clearFilterSelections,
  copyShopState,
  hasActiveRefinements,
  hasFilterSelections,
  parseShopState,
  reconcileShopState,
  removeShopRefinement,
  toggleFilterValue,
} from "../../utils/shopState";
import {
  appendedCount,
  createShopBrowseSnapshot,
  nextVisibleCount,
  readShopBrowseSnapshot,
  restoredVisibleCount,
  writeShopBrowseSnapshot,
} from "../../utils/shopBrowseState";
import "./Shop.css";

const SHOP_LEDE = SHOP_SEO.description;
const DIMENSION_KEYS = FILTER_DIMENSIONS.map((dimension) => dimension.key);
function ChatIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.8 8.8 0 0 1-3.3-.7L4 20l1.5-4.1A7.2 7.2 0 0 1 4.5 12 7.5 7.5 0 0 1 12 4.5a7.5 7.5 0 0 1 8 7Z" />
      <path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" />
    </svg>
  );
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
  const restoreBrowseKey = String(location.state?.restoreBrowseKey || location.key || "");
  const storedReturnSnapshot = useMemo(
    () => readShopBrowseSnapshot(restoreBrowseKey, currentShopPath),
    [restoreBrowseKey, currentShopPath]
  );
  const legacyRestoredCount = Number(location.state?.restoreVisibleCount);
  const routeReturnSnapshot = useMemo(() => {
    const anchorProductId = String(location.state?.restoreAnchorProductId || "").trim();
    if (!anchorProductId) return null;
    return createShopBrowseSnapshot({
      path: currentShopPath,
      anchorProductId,
      anchorResultIndex: null,
      visibleCount: Number.isFinite(legacyRestoredCount) ? legacyRestoredCount : batchSize,
      scrollY: 0,
      anchorViewportTop: null,
    });
  }, [batchSize, currentShopPath, legacyRestoredCount, location.state?.restoreAnchorProductId]);
  const returnSnapshot = storedReturnSnapshot || routeReturnSnapshot;
  const [searchDraft, setSearchDraft] = useState(() => String(location.state?.shopSearchDraft || state.query || ""));
  const [visibleCount, setVisibleCount] = useState(() => {
    if (returnSnapshot) return restoredVisibleCount(returnSnapshot, batchSize);
    return Number.isFinite(legacyRestoredCount) ? Math.max(batchSize, legacyRestoredCount) : batchSize;
  });
  const [loadAnnouncement, setLoadAnnouncement] = useState("");
  const [isLoadMorePending, setIsLoadMorePending] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [restoreNotice, setRestoreNotice] = useState("");
  const [stateNotice, setStateNotice] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerState, setDrawerState] = useState(() => copyShopState(state));
  const [drawerFiltersValid, setDrawerFiltersValid] = useState(true);
  const [drawerResetToken, setDrawerResetToken] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const resultsRef = useRef(null);
  const batchSizeRef = useRef(batchSize);
  const previousSearchKeyRef = useRef(searchKey);
  const restorationDoneKeyRef = useRef("");
  const loadMorePendingRef = useRef(false);
  const loadMoreFrameRef = useRef(null);
  const suppressNextResultResetRef = useRef(false);
  const [shopByGroups, setShopByGroups] = useState(DEFAULT_SHOP_BY_GROUPS);
  const [taxonomy, setTaxonomy] = useState(null);
  const [shopConfigReady, setShopConfigReady] = useState(false);

  const searchRequested = searchParams.get("focus") === "search";
  const [searchOpen, setSearchOpen] = useState(searchRequested);
  const searchInputRef = useRef(null);
  const showSearch = searchOpen || Boolean(state.query);
  const refined = hasActiveRefinements(state) || state.sort !== "newest";
  const hasQueryString = searchKey.length > 0;

  useDocumentMeta({
    title: SHOP_SEO.title,
    description: SHOP_SEO.description,
    canonicalPath: SHOP_SEO.canonicalPath,
    noindex: refined || hasQueryString,
  });

  useEffect(() => {
    let active = true;
    Promise.all([fetchShopByGroups(), fetchTaxonomyLabels()])
      .then(([groups, labels]) => {
        if (!active) return;
        if (groups.length) setShopByGroups(groups);
        setTaxonomy(labels);
      })
      .finally(() => {
        if (active) setShopConfigReady(true);
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

  useEffect(() => {
    batchSizeRef.current = batchSize;
  }, [batchSize]);

  useEffect(() => () => {
    if (loadMoreFrameRef.current) cancelAnimationFrame(loadMoreFrameRef.current);
  }, []);

  // Public/shareable Shop state owns the result set. When it changes, restart
  // progressive reveal for that new result set and return to the results
  // region. Responsive breakpoint changes deliberately do not reset depth.
  useEffect(() => {
    if (previousSearchKeyRef.current === searchKey) return;
    previousSearchKeyRef.current = searchKey;
    if (suppressNextResultResetRef.current) {
      suppressNextResultResetRef.current = false;
      return;
    }
    restorationDoneKeyRef.current = "";
    if (loadMoreFrameRef.current) cancelAnimationFrame(loadMoreFrameRef.current);
    loadMoreFrameRef.current = null;
    loadMorePendingRef.current = false;
    setIsLoadMorePending(false);
    setVisibleCount(batchSizeRef.current);
    setLoadAnnouncement("");
    setLoadMoreError("");
    setRestoreNotice("");
    setStateNotice("");
    const frame = requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [searchKey]);

  const updateState = useCallback((next, { replace = false } = {}) => {
    setStateNotice("");
    setSearchParams(buildSearchParams(next), { replace });
  }, [setSearchParams]);

  const toggleValue = useCallback((dimension, value) => {
    updateState(toggleFilterValue(state, dimension, value));
  }, [state, updateState]);

  const removeChip = useCallback((chip) => {
    updateState(removeShopRefinement(state, chip));
  }, [state, updateState]);

  const clearAll = useCallback(() => {
    updateState(clearAllRefinements(state));
  }, [state, updateState]);

  const clearSearch = useCallback(() => {
    updateState({ ...state, query: "" });
  }, [state, updateState]);

  const results = useMemo(() => applyShopState(catalogue, state), [catalogue, state]);
  const facets = useMemo(() => buildFacets(catalogue, state, taxonomy), [catalogue, state, taxonomy]);

  const discoveryModule = useMemo(
    () => buildShopDiscovery(catalogue, "Shop By", shopByGroups),
    [catalogue, shopByGroups]
  );

  useEffect(() => {
    if (!shopConfigReady || isLoading || error) return;

    let reconciled = state;
    let removed = [];
    if (catalogue.length > 0) {
      const reconciliation = reconcileShopState(state, {
        products: catalogue,
        taxonomy,
        discoveryGroups: discoveryModule?.groups ?? [],
      });
      reconciled = reconciliation.state;
      removed = reconciliation.removed;
    }

    const canonicalParams = buildSearchParams(reconciled);
    if (canonicalParams.toString() === searchParams.toString()) return;

    suppressNextResultResetRef.current = true;
    setSearchParams(canonicalParams, { replace: true });
    if (removed.length) {
      setStateNotice("Some previous Shop refinements are no longer available. The rest of your browsing context was kept.");
    }
  }, [catalogue, discoveryModule, error, isLoading, searchParams, setSearchParams, shopConfigReady, state, taxonomy]);

  const activeDiscoveryGroup = discoveryModule?.groups?.some((group) => group.id === state.discovery)
    ? state.discovery
    : (discoveryModule?.groups?.[0]?.id ?? "");
  const activeDiscoveryLabel = discoveryModule?.groups?.find((group) => group.id === state.discovery)?.label || "";
  const chips = useMemo(
    () => buildChips(state, { discoveryLabel: activeDiscoveryLabel }),
    [state, activeDiscoveryLabel]
  );

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

  useLayoutEffect(() => {
    if (isLoading || !returnSnapshot || restorationDoneKeyRef.current === restoreBrowseKey) return;

    const targetIndex = results.findIndex((product) =>
      product.id === returnSnapshot.anchorProductId || product.slug === returnSnapshot.anchorProductId
    );

    if (targetIndex >= 0 && visibleCount <= targetIndex) {
      setVisibleCount((count) => Math.max(count, targetIndex + 1, restoredVisibleCount(returnSnapshot, batchSizeRef.current)));
      return;
    }

    const frame = requestAnimationFrame(() => {
      let restored = false;

      if (targetIndex >= 0) {
        const nodes = resultsRef.current?.querySelectorAll("[data-product-id]") ?? [];
        const target = Array.from(nodes).find((node) => node.dataset.productId === results[targetIndex]?.id);
        if (target) {
          const preferredTop = returnSnapshot.anchorViewportTop;
          if (Number.isFinite(preferredTop)) {
            const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - preferredTop);
            window.scrollTo({ top, left: 0, behavior: "auto" });
          } else {
            target.scrollIntoView({ block: "center", behavior: "auto" });
          }
          restored = true;
        }
      }

      if (!restored && Number.isFinite(returnSnapshot.scrollY) && returnSnapshot.scrollY > 0) {
        window.scrollTo({ top: returnSnapshot.scrollY, left: 0, behavior: "auto" });
        restored = true;
      }

      if (!restored && returnSnapshot.anchorProductId) {
        resultsRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      }

      if (targetIndex < 0 && returnSnapshot.anchorProductId) {
        setRestoreNotice("That piece is no longer in this Shop view. Your browsing context was kept.");
      }

      restorationDoneKeyRef.current = restoreBrowseKey;
    });

    return () => cancelAnimationFrame(frame);
  }, [batchSize, isLoading, restoreBrowseKey, results, returnSnapshot, visibleCount]);

  const navigationState = useMemo(() => ({
    shopReturn: `/shop${location.search}`,
    shopVisibleCount: visibleCount,
    shopBrowseKey: location.key,
  }), [location.key, location.search, visibleCount]);

  const rememberShopPosition = useCallback((product, event) => {
    if (!product?.id) return;
    const card = event?.currentTarget?.closest?.("[data-product-id]");
    const snapshot = createShopBrowseSnapshot({
      path: `/shop${location.search}`,
      anchorProductId: product.id,
      anchorResultIndex: results.findIndex((entry) => entry.id === product.id),
      visibleCount,
      scrollY: window.scrollY,
      anchorViewportTop: card?.getBoundingClientRect?.().top,
    });
    if (snapshot) writeShopBrowseSnapshot(location.key, snapshot);
  }, [location.key, location.search, results, visibleCount]);

  const openDrawer = useCallback(() => {
    setDrawerState(copyShopState(state));
    setDrawerFiltersValid(true);
    setDrawerResetToken((token) => token + 1);
    setIsDrawerOpen(true);
  }, [state]);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const clearDrawerDraft = useCallback(() => {
    setDrawerState((current) => clearFilterSelections(current));
    setDrawerFiltersValid(true);
    setDrawerResetToken((token) => token + 1);
  }, []);

  const applyDrawerDraft = useCallback(() => {
    if (!drawerFiltersValid) return;
    updateState(applyFilterDraft(state, drawerState));
    setIsDrawerOpen(false);
  }, [drawerFiltersValid, drawerState, state, updateState]);

  const drawerFacets = useMemo(
    () => buildFacets(catalogue, drawerState, taxonomy),
    [catalogue, drawerState, taxonomy]
  );

  const drawerHasRefinements = hasFilterSelections(drawerState);

  const loadMorePieces = useCallback(() => {
    if (loadMorePendingRef.current) return;
    const nextCount = nextVisibleCount(visibleCount, batchSize, results.length);
    const added = appendedCount(visibleCount, nextCount, results.length);
    if (added <= 0) return;

    loadMorePendingRef.current = true;
    setIsLoadMorePending(true);
    setLoadMoreError("");

    loadMoreFrameRef.current = requestAnimationFrame(() => {
      try {
        setVisibleCount(nextCount);
        setLoadAnnouncement(`${added} more ${added === 1 ? "piece" : "pieces"} loaded.`);
      } catch {
        setLoadMoreError("We couldn't reveal more pieces. Please try again.");
      } finally {
        loadMorePendingRef.current = false;
        loadMoreFrameRef.current = null;
        setIsLoadMorePending(false);
      }
    });
  }, [batchSize, results.length, visibleCount]);

  const desktopFilterPanel = (
    <ShopFilters
      facets={facets}
      state={state}
      onToggleValue={toggleValue}
      onToggleNewIn={(checked) => updateState({ ...state, newIn: checked })}
      onPriceChange={(min, max) => updateState({ ...state, min, max })}
      showClear={false}
    />
  );

  const drawerFilterPanel = (
    <ShopFilters
      facets={drawerFacets}
      state={drawerState}
      onToggleValue={(dimension, value) => setDrawerState((current) => toggleFilterValue(current, dimension, value))}
      onToggleNewIn={(checked) => setDrawerState((current) => ({ ...current, newIn: checked }))}
      onPriceChange={(min, max) => setDrawerState((current) => ({ ...current, min, max }))}
      showClear={false}
      idPrefix="drawer-filters"
      resetToken={drawerResetToken}
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
          <div className="shop__intro-content">
            <div className="shop__intro-main">
              <h1 className="shop__title" id="shop-title">Shop</h1>
              <p className="shop__lede">{SHOP_LEDE}</p>
            </div>
            <div className="shop__intro-assist">
              <p className="shop__assist-text">Need help choosing?</p>
              <Link className="shop__assist-link" to="/chats" state={{ draft: couturierDraft }}>
                <ChatIcon size={18} />
                <span>Chat with a Couturier</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
        <div className="shop__cloth-hem" aria-hidden="true" />
      </section>

      {discoveryModule ? (
        <div className="container shop__discovery">
          <DiscoveryModule
            module={discoveryModule}
            className="discovery--shop"
            hideTitleWithTabs
            activeGroup={activeDiscoveryGroup}
            renderMedia={(item) => <ProductImage image={item.image} alt="" transformation="w_480,h_600,c_fill,g_auto,q_auto,f_auto" />}
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
        <aside id="shop-filter-sidebar" className="shop__sidebar" aria-label="Filters" aria-hidden={!isSidebarOpen}>
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
              aria-controls="shop-filter-drawer"
              aria-expanded={isDrawerOpen}
            >
              <SlidersIcon size={20} />
              <span>Filters</span>
            </button>

            <button
              type="button"
              className="shop__sidebar-toggle"
              aria-controls="shop-filter-sidebar"
              aria-expanded={isSidebarOpen}
              onClick={() => setIsSidebarOpen((open) => !open)}
            >
              <SlidersIcon size={18} />
              <span>{isSidebarOpen ? "Hide Filters" : "Show Filters"}</span>
            </button>

            <SortControl value={state.sort} onChange={(sort) => updateState({ ...state, sort })} />
          </div>

          <FilterChips chips={chips} onRemove={removeChip} onClearAll={clearAll} />

          {restoreNotice ? <p className="shop__restore-notice" role="status">{restoreNotice}</p> : null}
          {stateNotice ? <p className="shop__restore-notice" role="status">{stateNotice}</p> : null}

          <p className="visually-hidden" role="status" aria-live="polite">
            {isLoading ? "Loading pieces." : error ? "The collection could not be loaded." : results.length === 0 ? "No pieces match the current Shop state." : "Product results updated."}
          </p>
          <p className="visually-hidden" role="status" aria-live="polite">{loadAnnouncement}</p>

          {isLoading ? <ShopSkeleton /> : null}

          {!isLoading && error ? (
            <div className="shop__state shop__state--error" role="alert">
              <p className="shop__state-kicker">The collection is taking a little longer</p>
              <h2>We couldn’t load the Shop.</h2>
              <p>Please check your connection and try again. Your Shop settings have not been changed.</p>
              <button type="button" className="btn btn--primary" onClick={retry}>Try again</button>
            </div>
          ) : null}

          {!isLoading && !error && products.length === 0 ? (
            <div className="shop__state">
              <p className="shop__state-kicker">The collection</p>
              <h2>New pieces are being prepared.</h2>
              <p>Explore Custom Style, or speak with a Dicta Couturier about the piece you have in mind.</p>
              <Link className="btn btn--secondary" to="/custom-style">Explore Custom Style</Link>
            </div>
          ) : null}

          {!isLoading && catalogue.length > 0 && results.length === 0 ? (
            <div className="shop__state shop__state--empty">
              <p className="shop__state-kicker">Refine your search</p>
              <h2>{state.query ? `No match for “${state.query}”` : "No pieces match these refinements"}</h2>
              <p>
                {state.query
                  ? "No matching pieces were found. Your search is still applied, so you can clear it or keep refining."
                  : "Your current refinements produced no matching pieces. Remove a filter, clear the refinements, or ask a Dicta Couturier for help."}
              </p>
              <div className="shop__state-actions">
                {state.query ? (
                  <button type="button" className="btn btn--secondary" onClick={clearSearch}>Clear Search</button>
                ) : null}
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
                {loadMoreError ? (
                  <div className="shop__load-more-error" role="alert">
                    <span>{loadMoreError}</span>
                    <button type="button" className="shop__load-more-retry" onClick={loadMorePieces}>Retry</button>
                  </div>
                ) : null}
                {remaining > 0 ? (
                  <button
                    type="button"
                    className="shop__load-more-button"
                    onClick={loadMorePieces}
                    disabled={isLoadMorePending}
                    aria-busy={isLoadMorePending || undefined}
                  >
                    <span>{isLoadMorePending ? "Loading Pieces…" : "Load More Pieces"}</span>
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
        onClose={closeDrawer}
        onApply={applyDrawerDraft}
        onClearAll={clearDrawerDraft}
        canClear={drawerHasRefinements || !drawerFiltersValid}
        canApply={drawerFiltersValid}
      >
        {drawerFilterPanel}
      </FilterDrawer>
    </div>
  );
}
