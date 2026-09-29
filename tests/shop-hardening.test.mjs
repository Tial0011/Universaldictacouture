import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const shop = await readFile(new URL("../src/pages/Shop/Shop.jsx", import.meta.url), "utf8");
const shopCss = await readFile(new URL("../src/pages/Shop/Shop.css", import.meta.url), "utf8");
const productCard = await readFile(new URL("../src/components/product/ProductCard.jsx", import.meta.url), "utf8");
const productGrid = await readFile(new URL("../src/components/product/ProductGrid.jsx", import.meta.url), "utf8");
const productImage = await readFile(new URL("../src/components/product/ProductImage.jsx", import.meta.url), "utf8");
const drawer = await readFile(new URL("../src/components/shop/FilterDrawer.jsx", import.meta.url), "utf8");
const chips = await readFile(new URL("../src/components/shop/FilterChips.jsx", import.meta.url), "utf8");
const catalogueHook = await readFile(new URL("../src/hooks/useCatalogue.js", import.meta.url), "utf8");
const metaHook = await readFile(new URL("../src/hooks/useDocumentMeta.js", import.meta.url), "utf8");
const shopSeo = await readFile(new URL("../src/config/shopSeo.js", import.meta.url), "utf8");


test("Task 8: initial catalogue loading uses card-shaped skeletons with reduced-motion protection", () => {
  assert.match(shop, /function ShopSkeleton/);
  assert.match(shop, /shop-skeleton__media/);
  assert.match(shop, /shop-skeleton__line--name/);
  assert.match(shop, /shop-skeleton__line--price/);
  assert.match(shop, /shop-skeleton__button/);
  assert.match(shopCss, /shop-skeleton__media\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*5/s);
  assert.match(shopCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*shop-skeleton__media[\s\S]*animation:\s*none/);
});

test("Task 8: search/filter/empty states preserve context and offer explicit recovery", () => {
  assert.match(shop, /No match for/);
  assert.match(shop, />Clear Search</);
  assert.match(shop, /No pieces match these refinements/);
  assert.match(shop, />Clear All</);
  assert.match(shop, /New pieces are being prepared/);
  assert.doesNotMatch(shop, /\{error\}<\/p>/);
  assert.match(shop, /Please check your connection and try again/);
});

test("Task 8: stale public Shop state is reconciled and canonicalized without a second state system", () => {
  assert.match(shop, /reconcileShopState\(state/);
  assert.match(shop, /setSearchParams\(canonicalParams, \{ replace: true \}\)/);
  assert.match(shop, /Some previous Shop refinements are no longer available/);
});

test("Task 8: Load More keeps existing grid, blocks repeat activation and exposes accessible retry/status", () => {
  assert.match(shop, /disabled=\{isLoadMorePending\}/);
  assert.match(shop, /aria-busy=\{isLoadMorePending \|\| undefined\}/);
  assert.match(shop, /role="alert"[\s\S]*shop__load-more-retry/);
  assert.match(shop, /role="status" aria-live="polite"\>\{loadAnnouncement\}/);
  assert.match(shop, /You've shopped all available pieces\./);
});

test("Task 8: Search, Filters, Sort, chips and mobile drawer retain accessible names/focus semantics", () => {
  assert.match(shop, /htmlFor="shop-search"\>Search the Shop/);
  assert.match(shop, /aria-controls="shop-filter-drawer"/);
  assert.match(shop, /htmlFor="shop-sort"\>Sort by/);
  assert.match(chips, /aria-label=\{`Remove \$\{chip\.label\}`\}/);
  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /aria-modal="true"/);
  assert.match(drawer, /previouslyFocused\.focus\(\)/);
  assert.match(shopCss, /filter-chips__chip:focus-visible/);
  assert.match(shopCss, /scroll-margin-block-end:\s*calc\(76px \+ env\(safe-area-inset-bottom\)\)/);
});

test("Task 8: My Closet heart and SHOP PIECE remain independent accessible controls", () => {
  assert.match(productCard, /aria-pressed=\{saved\}/);
  assert.match(productCard, /aria-label=\{saved \? `Remove \$\{product\.name\} from My Closet`/);
  assert.match(productCard, /const ctaLabel = PRODUCT_SHOP_CTA/);
  assert.doesNotMatch(productCard, /SHOP THIS PIECE|VIEW PIECE|View Piece/);
});

test("Task 8: image delivery remains responsive/lazy without Product Details gallery preloading", () => {
  assert.match(productGrid, /imageLoading=\{index < resolvedEagerCount \? "eager" : "lazy"\}/);
  assert.match(productImage, /srcSet=\{srcSet \|\| undefined\}/);
  assert.match(productImage, /decoding="async"/);
  assert.match(productImage, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.doesNotMatch(productCard, /product\.images\.map|gallery/i);
});

test("Task 8: catalogue failures expose a fixed customer-safe message rather than provider exceptions", () => {
  assert.match(catalogueHook, /error: "The collection could not be loaded\. Please try again\."/);
  assert.doesNotMatch(catalogueHook, /error:\s*error\?\.message/);
});

test("Task 8: Shop SEO uses clean canonical URL and noindexes query-state variants", () => {
  assert.match(shop, /canonicalPath: SHOP_SEO\.canonicalPath/);
  assert.match(shopSeo, /canonicalPath: "\/shop"/);
  assert.match(shopSeo, /Shop — Universal Dicta Couture/);
  assert.match(shop, /noindex: refined \|\| hasQueryString/);
  assert.match(metaHook, /link\[rel="canonical"\]/);
  assert.match(metaHook, /noindex,follow/);
});
