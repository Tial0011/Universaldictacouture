export function reviewIds(value) {
  return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string" && id.trim()))] : [];
}

/** Local bookmarks remain usable while account reads/writes are unavailable. */
export function createSavedReviewStore({ initial = {}, persist, loadRemote, writeRemote }) {
  let ids = reviewIds(initial.reviewIds);
  let revision = 0;
  const pending = new Map();
  const overrides = new Map();
  for (const change of Array.isArray(initial.pending) ? initial.pending : []) {
    if (typeof change?.id !== "string" || !change.id || typeof change.saved !== "boolean") continue;
    const operation = { saved: change.saved, revision: ++revision };
    pending.set(change.id, operation);
    overrides.set(change.id, operation);
  }
  let storage = "memory";
  let loadError = false;
  let writeError = false;
  let reading = null;
  let writing = null;
  let started = false;
  const listeners = new Set();
  let snapshot;

  function publish() {
    const localMessage = storage === "browser" ? "Your bookmarks are kept in this browser."
      : storage === "session" ? "Your bookmarks are kept in this tab for this visit."
        : "Browser storage is unavailable; bookmarks will last only until this page is closed or refreshed.";
    snapshot = {
      savedReviewIds: ids,
      storage,
      error: loadError || writeError ? `Account sync is unavailable. ${localMessage}` : storage === "memory" && started ? localMessage : "",
    };
    listeners.forEach((listener) => listener());
  }

  function saveLocal() {
    try {
      storage = persist({ reviewIds: ids, pending: [...pending].map(([id, operation]) => ({ id, saved: operation.saved })) });
    } catch { storage = "memory"; }
  }

  function apply(base, changes) {
    const result = new Set(reviewIds(base));
    for (const [id, operation] of changes) {
      if (operation.saved) result.add(id);
      else result.delete(id);
    }
    return [...result];
  }

  function refresh() {
    if (!loadRemote) return Promise.resolve();
    if (reading) return reading;
    reading = Promise.resolve().then(loadRemote).then((remoteIds) => {
      // Keep changes made while the request was in flight, even if already synced.
      ids = apply(remoteIds, overrides);
      loadError = false;
      saveLocal();
      publish();
    }).catch(() => {
      loadError = true;
      publish();
    }).finally(() => { reading = null; });
    return reading;
  }

  function flush() {
    if (!writeRemote || !pending.size) return Promise.resolve();
    if (writing) return writing;
    writing = Promise.resolve().then(async () => {
      while (pending.size) {
        const [id, operation] = pending.entries().next().value;
        try {
          // The adapter changes only this review, preserving other account bookmarks.
          await writeRemote(id, operation.saved);
        } catch {
          writeError = true;
          publish();
          return;
        }
        if (pending.get(id)?.revision === operation.revision) pending.delete(id);
        writeError = false;
        saveLocal();
        publish();
      }
    }).finally(() => { writing = null; });
    return writing;
  }

  publish();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() {
      if (started) return;
      started = true;
      saveLocal();
      publish();
      void refresh();
      void flush();
    },
    toggle(id) {
      if (typeof id !== "string" || !id.trim()) return null;
      const added = !ids.includes(id);
      const operation = { saved: added, revision: ++revision };
      ids = apply(ids, new Map([[id, operation]]));
      if (writeRemote) {
        pending.set(id, operation);
        overrides.set(id, operation);
      }
      saveLocal();
      publish();
      void flush();
      return { added, storage };
    },
    replaceGuestIds(next) {
      if (writeRemote) return;
      ids = reviewIds(next);
      publish();
    },
    retry: () => Promise.all([refresh(), flush()]),
  };
}
