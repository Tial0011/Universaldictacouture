const STORAGE_PREFIX = "udc:shop:browse:v1:";
const SNAPSHOT_VERSION = 1;
const MAX_VISIBLE_COUNT = 5000;
const MAX_SCROLL_Y = 10_000_000;
const MAX_ANCHOR_TOP = 10_000;

function cleanFiniteNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const bounded = Math.min(max, Math.max(min, number));
  return integer ? Math.floor(bounded) : bounded;
}

function safeStorage(storage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function browseStorageKey(entryKey) {
  const key = String(entryKey || "").trim();
  return key ? `${STORAGE_PREFIX}${key}` : "";
}

export function createShopBrowseSnapshot({
  path,
  anchorProductId,
  anchorResultIndex,
  visibleCount,
  scrollY,
  anchorViewportTop,
}) {
  const cleanPath = String(path || "").trim();
  const productId = String(anchorProductId || "").trim();
  if (!(cleanPath === "/shop" || cleanPath.startsWith("/shop?")) || !productId) return null;

  return {
    version: SNAPSHOT_VERSION,
    path: cleanPath,
    anchorProductId: productId,
    anchorResultIndex: cleanFiniteNumber(anchorResultIndex, { integer: true, max: MAX_VISIBLE_COUNT - 1 }),
    visibleCount: cleanFiniteNumber(visibleCount, { integer: true, min: 1, max: MAX_VISIBLE_COUNT }),
    scrollY: cleanFiniteNumber(scrollY, { max: MAX_SCROLL_Y }) ?? 0,
    anchorViewportTop: cleanFiniteNumber(anchorViewportTop, { max: MAX_ANCHOR_TOP }),
  };
}

export function writeShopBrowseSnapshot(entryKey, snapshot, storage) {
  const key = browseStorageKey(entryKey);
  const target = safeStorage(storage);
  if (!key || !snapshot || !target) return false;
  try {
    target.setItem(key, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function readShopBrowseSnapshot(entryKey, expectedPath, storage) {
  const key = browseStorageKey(entryKey);
  const target = safeStorage(storage);
  if (!key || !target) return null;

  try {
    const parsed = JSON.parse(target.getItem(key) || "null");
    if (!parsed || parsed.version !== SNAPSHOT_VERSION) return null;
    if (String(parsed.path || "") !== String(expectedPath || "")) return null;
    return createShopBrowseSnapshot(parsed);
  } catch {
    return null;
  }
}

export function restoredVisibleCount(snapshot, batchSize) {
  const batch = cleanFiniteNumber(batchSize, { integer: true, min: 1, max: MAX_VISIBLE_COUNT }) ?? 1;
  if (!snapshot) return batch;
  const depth = snapshot.visibleCount ?? batch;
  const anchorDepth = snapshot.anchorResultIndex === null || snapshot.anchorResultIndex === undefined
    ? 0
    : snapshot.anchorResultIndex + 1;
  return Math.max(batch, depth, anchorDepth);
}

export function nextVisibleCount(currentVisible, batchSize, totalResults) {
  const current = cleanFiniteNumber(currentVisible, { integer: true, min: 0, max: MAX_VISIBLE_COUNT }) ?? 0;
  const batch = cleanFiniteNumber(batchSize, { integer: true, min: 1, max: MAX_VISIBLE_COUNT }) ?? 1;
  const total = cleanFiniteNumber(totalResults, { integer: true, min: 0, max: MAX_VISIBLE_COUNT }) ?? 0;
  return Math.min(total, current + batch);
}

export function appendedCount(currentVisible, nextCount, totalResults) {
  const total = cleanFiniteNumber(totalResults, { integer: true, min: 0, max: MAX_VISIBLE_COUNT }) ?? 0;
  const before = Math.min(total, cleanFiniteNumber(currentVisible, { integer: true, min: 0, max: MAX_VISIBLE_COUNT }) ?? 0);
  const after = Math.min(total, cleanFiniteNumber(nextCount, { integer: true, min: 0, max: MAX_VISIBLE_COUNT }) ?? before);
  return Math.max(0, after - before);
}
