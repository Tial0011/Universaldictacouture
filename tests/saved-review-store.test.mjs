import test from "node:test";
import assert from "node:assert/strict";
import { createSavedReviewStore, createSavedItemsStore } from "../src/services/savedReviewStore.js";

test("liked pieces use the same offline-safe engine without changing productIds storage", async () => {
  let cached;
  const store = createSavedItemsStore({ idsField: "productIds", snapshotField: "savedIds", itemLabel: "saved pieces", initial: { productIds: ["old"] }, persist: value => { cached = value; return "browser"; }, loadRemote: async () => { throw new Error("offline"); }, writeRemote: async () => { throw new Error("offline"); } });
  store.start();
  assert.equal(store.toggle("new").added, true);
  await store.retry();
  assert.deepEqual(store.getSnapshot().savedIds, ["old", "new"]);
  assert.match(store.getSnapshot().error, /saved pieces are kept in this browser/);
  assert.deepEqual(cached.productIds, ["old", "new"]);
  const reopened = createSavedItemsStore({ idsField: "productIds", snapshotField: "savedIds", initial: cached, persist: () => "browser" });
  assert.deepEqual(reopened.getSnapshot().savedIds, ["old", "new"]);
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function cache() {
  let record = {};
  return {
    persist(value) { record = structuredClone(value); return "browser"; },
    read() { return structuredClone(record); },
  };
}

test("denied account access does not disable saving, and the bookmark survives reopening", async () => {
  const local = cache();
  const denied = async () => { throw new Error("permission-denied"); };
  const options = { persist: local.persist, loadRemote: denied, writeRemote: denied };
  const store = createSavedReviewStore(options);
  store.start();
  await store.retry();
  assert.match(store.getSnapshot().error, /Account sync is unavailable/);
  assert.deepEqual(store.toggle("review-one"), { added: true, storage: "browser" });
  assert.deepEqual(store.getSnapshot().savedReviewIds, ["review-one"]);
  await store.retry();
  assert.deepEqual(local.read().pending, [{ id: "review-one", saved: true }]);

  const reopened = createSavedReviewStore({ ...options, initial: local.read() });
  reopened.start();
  await reopened.retry();
  assert.deepEqual(reopened.getSnapshot().savedReviewIds, ["review-one"]);
});

test("retry syncs local changes while preserving other account bookmarks", async () => {
  const local = cache();
  const remote = new Set(["previously-saved"]);
  let online = false;
  const store = createSavedReviewStore({
    persist: local.persist,
    loadRemote: async () => { if (!online) throw new Error("offline"); return [...remote]; },
    writeRemote: async (id, saved) => { if (!online) throw new Error("offline"); if (saved) remote.add(id); else remote.delete(id); },
  });
  store.start();
  await store.retry();
  store.toggle("new-review");
  await store.retry();
  online = true;
  await store.retry();
  assert.deepEqual([...remote].sort(), ["new-review", "previously-saved"]);
  assert.deepEqual([...store.getSnapshot().savedReviewIds].sort(), ["new-review", "previously-saved"]);
  assert.deepEqual(local.read().pending, []);
  assert.equal(store.getSnapshot().error, "");
});

test("a removal made offline survives reload and is not resurrected by account loading", async () => {
  const local = cache();
  const store = createSavedReviewStore({
    initial: { reviewIds: ["old-review"] }, persist: local.persist,
    writeRemote: async () => { throw new Error("offline"); },
  });
  store.start();
  store.toggle("old-review");
  await store.retry();
  const changes = [];
  const reopened = createSavedReviewStore({
    initial: local.read(), persist: local.persist,
    loadRemote: async () => ["old-review", "other-review"],
    writeRemote: async (id, saved) => { changes.push({ id, saved }); },
  });
  reopened.start();
  await reopened.retry();
  assert.deepEqual(reopened.getSnapshot().savedReviewIds, ["other-review"]);
  assert.deepEqual(changes, [{ id: "old-review", saved: false }]);
});

test("a slow initial account read cannot erase a new bookmark after its write succeeds", async () => {
  const local = cache();
  const read = deferred();
  const store = createSavedReviewStore({ persist: local.persist, loadRemote: () => read.promise, writeRemote: async () => {} });
  store.start();
  store.toggle("new-review");
  await tick();
  assert.deepEqual(local.read().pending, []);
  read.resolve([]);
  await store.retry();
  assert.deepEqual(store.getSnapshot().savedReviewIds, ["new-review"]);
});

test("rapid save then remove keeps the newer action while an earlier write is in flight", async () => {
  const local = cache();
  const firstWrite = deferred();
  const writes = [];
  const store = createSavedReviewStore({
    persist: local.persist,
    writeRemote: async (id, saved) => { writes.push({ id, saved }); if (writes.length === 1) await firstWrite.promise; },
  });
  store.start();
  store.toggle("review");
  await tick();
  store.toggle("review");
  firstWrite.resolve();
  await store.retry();
  assert.deepEqual(writes, [{ id: "review", saved: true }, { id: "review", saved: false }]);
  assert.deepEqual(store.getSnapshot().savedReviewIds, []);
  assert.deepEqual(local.read().pending, []);
});

test("guest bookmarks update immediately without any account service", () => {
  const local = cache();
  const store = createSavedReviewStore({ persist: local.persist });
  store.start();
  store.toggle("review");
  store.toggle("second");
  store.toggle("review");
  assert.deepEqual(local.read().reviewIds, ["second"]);
  assert.deepEqual(local.read().pending, []);
  store.replaceGuestIds(["another-tab"]);
  assert.deepEqual(store.getSnapshot().savedReviewIds, ["another-tab"]);
});

test("blocked browser storage is reported without making the button inert", () => {
  const store = createSavedReviewStore({ persist: () => { throw new Error("blocked"); } });
  store.start();
  assert.deepEqual(store.toggle("review"), { added: true, storage: "memory" });
  assert.deepEqual(store.getSnapshot().savedReviewIds, ["review"]);
  assert.match(store.getSnapshot().error, /Browser storage is unavailable/);
});

test("confirmed product save rolls back after an authoritative write failure", async () => {
  const local = cache();
  let writes = 0;
  const store = createSavedItemsStore({
    idsField: "productIds",
    snapshotField: "savedIds",
    itemLabel: "saved pieces",
    persist: local.persist,
    writeRemote: async () => {
      writes += 1;
      throw new Error("permission-denied");
    },
  });

  store.start();
  const result = await store.toggleConfirmed("piece-one");

  assert.deepEqual(result, { added: true, storage: "browser", ok: false });
  assert.equal(writes, 1);
  assert.deepEqual(store.getSnapshot().savedIds, []);
  assert.deepEqual(local.read().productIds, []);
  assert.deepEqual(local.read().pending, []);
  assert.match(store.getSnapshot().error, /Account sync is unavailable/);
});

test("confirmed product save keeps a successful authoritative write and remains deduplicated", async () => {
  const local = cache();
  const remote = new Set();
  const store = createSavedItemsStore({
    idsField: "productIds",
    snapshotField: "savedIds",
    itemLabel: "saved pieces",
    initial: { productIds: ["piece-one", "piece-one"] },
    persist: local.persist,
    writeRemote: async (id, saved) => {
      if (saved) remote.add(id);
      else remote.delete(id);
    },
  });

  store.start();
  assert.deepEqual(store.getSnapshot().savedIds, ["piece-one"]);

  const remove = await store.toggleConfirmed("piece-one");
  assert.deepEqual(remove, { added: false, storage: "browser", ok: true });
  assert.deepEqual(store.getSnapshot().savedIds, []);

  const add = await store.toggleConfirmed("piece-one");
  assert.deepEqual(add, { added: true, storage: "browser", ok: true });
  assert.deepEqual(store.getSnapshot().savedIds, ["piece-one"]);
  assert.deepEqual([...remote], ["piece-one"]);
});

test("confirmed guest product save stays browser-local without requiring an account", async () => {
  const local = cache();
  const store = createSavedItemsStore({
    idsField: "productIds",
    snapshotField: "savedIds",
    itemLabel: "saved pieces",
    persist: local.persist,
  });

  store.start();
  const result = await store.toggleConfirmed("guest-piece");
  assert.deepEqual(result, { added: true, storage: "browser", ok: true });
  assert.deepEqual(store.getSnapshot().savedIds, ["guest-piece"]);
  assert.deepEqual(local.read().productIds, ["guest-piece"]);
});
