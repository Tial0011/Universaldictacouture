import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  appendedCount,
  browseStorageKey,
  createShopBrowseSnapshot,
  nextVisibleCount,
  readShopBrowseSnapshot,
  restoredVisibleCount,
  writeShopBrowseSnapshot,
} from "../src/utils/shopBrowseState.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const shopSource = await readFile(new URL("../src/pages/Shop/Shop.jsx", import.meta.url), "utf8");
const productCardSource = await readFile(new URL("../src/components/product/ProductCard.jsx", import.meta.url), "utf8");
const productGridSource = await readFile(new URL("../src/components/product/ProductGrid.jsx", import.meta.url), "utf8");
const detailsSource = await readFile(new URL("../src/pages/ProductDetails/ProductDetails.jsx", import.meta.url), "utf8");
const homeSource = await readFile(new URL("../src/pages/Home/Home.jsx", import.meta.url), "utf8");
const contentSource = await readFile(new URL("../src/services/content.js", import.meta.url), "utf8");
const batchSource = await readFile(new URL("../src/hooks/useBatchSize.js", import.meta.url), "utf8");
const discoverySource = await readFile(new URL("../src/components/discovery/DiscoveryModule.jsx", import.meta.url), "utf8");
const newInSource = await readFile(new URL("../src/components/home/NewIn.jsx", import.meta.url), "utf8");
const reviewsSource = await readFile(new URL("../src/components/reviews/ReviewCarousel.jsx", import.meta.url), "utf8");
const adminSchemaSource = await readFile(new URL("../src/components/admin/recordSchemas.js", import.meta.url), "utf8");

test("transient browse snapshot stores only compact restoration metadata and is entry scoped", () => {
  const storage = memoryStorage();
  const snapshot = createShopBrowseSnapshot({
    path: "/shop?occasion=Wedding%20Guest&sort=price-asc",
    anchorProductId: "piece-151",
    anchorResultIndex: 150,
    visibleCount: 200,
    scrollY: 4820,
    anchorViewportTop: 224,
  });

  assert.equal(writeShopBrowseSnapshot("history-entry-a", snapshot, storage), true);
  assert.match(browseStorageKey("history-entry-a"), /history-entry-a$/);
  assert.deepEqual(
    readShopBrowseSnapshot("history-entry-a", snapshot.path, storage),
    snapshot
  );
  assert.equal(readShopBrowseSnapshot("history-entry-b", snapshot.path, storage), null);
});

test("stale transient state never overrides a different canonical Shop URL", () => {
  const storage = memoryStorage();
  const snapshot = createShopBrowseSnapshot({
    path: "/shop?newin=1",
    anchorProductId: "new-in-piece",
    anchorResultIndex: 70,
    visibleCount: 100,
    scrollY: 1000,
  });
  writeShopBrowseSnapshot("entry", snapshot, storage);
  assert.equal(readShopBrowseSnapshot("entry", "/shop?style=Classic", storage), null);
});

test("restoration depth always reveals the remembered product", () => {
  const snapshot = createShopBrowseSnapshot({
    path: "/shop",
    anchorProductId: "piece-151",
    anchorResultIndex: 150,
    visibleCount: 100,
    scrollY: 0,
  });
  assert.equal(restoredVisibleCount(snapshot, 50), 151);
});

test("Load More appends the stable logical batch and remainder without duplication math", () => {
  assert.equal(nextVisibleCount(50, 50, 230), 100);
  assert.equal(appendedCount(50, 100, 230), 50);
  assert.equal(nextVisibleCount(200, 50, 230), 230);
  assert.equal(appendedCount(200, 230, 230), 30);
  assert.equal(nextVisibleCount(230, 50, 230), 230);
  assert.equal(appendedCount(230, 230, 230), 0);
});

test("Revision 4 logical batches remain 50 mobile, 100 tablet and 150 desktop", () => {
  assert.match(batchSource, /min-width: 1024px[\s\S]*return 150/);
  assert.match(batchSource, /min-width: 768px[\s\S]*return 100/);
  assert.match(batchSource, /return 50/);
});

test("Shop records a product anchor and Product Details carries it back without changing canonical routing", () => {
  assert.match(productCardSource, /shopAnchorProductId: product\.id/);
  assert.match(productCardSource, /to=\{product\.href\}/);
  assert.match(productGridSource, /data-product-id=\{product\.id\}/);
  assert.match(shopSource, /createShopBrowseSnapshot/);
  assert.match(shopSource, /anchorResultIndex: results\.findIndex/);
  assert.match(detailsSource, /restoreBrowseKey: location\.state\?\.shopBrowseKey/);
  assert.match(detailsSource, /restoreAnchorProductId: location\.state\?\.shopAnchorProductId/);
});

test("direct Product Details entry does not fabricate a Shop restoration session", () => {
  assert.match(detailsSource, /const cameFromShop = backToShop === requestedReturn/);
  assert.match(detailsSource, /const backState = cameFromShop[\s\S]*: undefined/);
});

test("Homepage entry contracts remain canonical and keep New In distinct from Newest First", () => {
  assert.match(contentSource, /primaryCta: \{ label: "Shop the Collection", to: "\/shop" \}/);
  assert.match(contentSource, /secondaryCta: \{ label: "Explore All Styles", to: "\/shop\?discovery=style" \}/);
  assert.match(homeSource, /viewAllTo=\"\/shop\?newin=1\"/);
  assert.match(homeSource, /viewAllTo=\{\(groupId\) => groupId \? `\/shop\?discovery=\$\{encodeURIComponent\(groupId\)\}` : "\/shop"\}/);
  assert.match(contentSource, /destination = group\.param[\s\S]*`\/shop\?\$\{group\.param\}=\$\{encodeURIComponent\(entry\.name\)\}`/);
  assert.doesNotMatch(homeSource, /newin=1[^\n]*sort=/i);
});

test("Load More remains deliberate, accessible, exact on exhaustion and has no infinite-scroll trigger", () => {
  assert.match(shopSource, /"Load More Pieces"/);
  assert.match(shopSource, /You've shopped all available pieces\./);
  assert.match(shopSource, /disabled=\{isLoadMorePending\}/);
  assert.match(shopSource, /aria-busy=\{isLoadMorePending \|\| undefined\}/);
  assert.match(shopSource, /more \$\{added === 1 \? "piece" : "pieces"\} loaded\./);
  assert.doesNotMatch(shopSource, /IntersectionObserver/);
  assert.doesNotMatch(shopSource, /Page \d|numbered pagination/i);
});

test("responsive width changes do not reset revealed depth", () => {
  assert.match(shopSource, /batchSizeRef\.current = batchSize/);
  assert.match(shopSource, /if \(previousSearchKeyRef\.current === searchKey\) return/);
  assert.doesNotMatch(shopSource, /\[batchSize, searchKey/);
});

test("Homepage and Shop rails continue auto motion on desktop instead of pausing on hover", () => {
  for (const source of [discoverySource, newInSource, reviewsSource]) {
    assert.doesNotMatch(source, /onMouseEnter=\{handleInteractionStart\}/);
    assert.doesNotMatch(source, /onMouseLeave=\{handleInteractionEnd\}/);
    assert.match(source, /requestAnimationFrame\(tick\)/);
    assert.match(source, /prefers-reduced-motion: reduce/);
  }
});


test("owner wording correction uses Shop Space for the existing discovery content area", () => {
  assert.match(adminSchemaSource, /title: "Shop Space"/);
  assert.doesNotMatch(adminSchemaSource, /title: "Shop discovery"/);
});
