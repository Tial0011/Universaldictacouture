import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { arrayRemove, arrayUnion, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { createSavedItemsStore, mergeValidatedSavedIds, reviewIds as itemIds } from "../services/savedReviewStore";
import { useAuth } from "./AuthContext";
import { validatePublishedProductIds } from "../services/products";

const SavedPiecesContext = createContext({
  savedIds: [],
  isSaved: () => false,
  toggleSaved: () => false,
  toggleSavedConfirmed: async () => null,
  retrySync: () => {},
  isPersistent: false,
  isReady: true,
  storage: "memory",
  error: "",
});
const GUEST_KEY = "udc:saved-pieces:guest";
function parseRecord(raw) {
  try {
    const record = JSON.parse(raw || "{}");
    return { productIds: itemIds(Array.isArray(record) ? record : record?.productIds), pending: Array.isArray(record?.pending) ? record.pending : [] };
  } catch { return { productIds: [], pending: [] }; }
}
function readAccountRecord(key) {
  let raw;
  try { raw = localStorage.getItem(key); } catch { /* blocked storage */ }
  if (raw == null) try { raw = sessionStorage.getItem(key); } catch { /* blocked storage */ }
  return parseRecord(raw);
}
function readGuestRecord() {
  // Guest Shop saves are device/browser-local catalogue state. Prefer
  // localStorage so they survive ordinary return visits, while still
  // accepting the older sessionStorage record during migration.
  let localRaw;
  let sessionRaw;
  try { localRaw = localStorage.getItem(GUEST_KEY); } catch { /* blocked storage */ }
  try { sessionRaw = sessionStorage.getItem(GUEST_KEY); } catch { /* blocked storage */ }
  const local = parseRecord(localRaw);
  const session = parseRecord(sessionRaw);
  return {
    productIds: itemIds([...local.productIds, ...session.productIds]),
    pending: [...local.pending, ...session.pending],
  };
}
function writeAccountRecord(key, record) {
  const value = JSON.stringify(record);
  try { localStorage.setItem(key, value); return "browser"; }
  catch { try { sessionStorage.setItem(key, value); return "session"; } catch { return "memory"; } }
}
function writeGuestRecord(record) {
  const value = JSON.stringify(record);
  try {
    localStorage.setItem(GUEST_KEY, value);
    // Clear the old session-only copy after a successful persistent write.
    try { sessionStorage.removeItem(GUEST_KEY); } catch { /* blocked storage */ }
    return "browser";
  } catch {
    try { sessionStorage.setItem(GUEST_KEY, value); return "session"; }
    catch { return "memory"; }
  }
}
export function SavedPiecesProvider({ children }) {
  const { user } = useAuth();
  return <SavedSession key={user?.uid || "guest"} uid={user?.uid}>{children}</SavedSession>;
}
function SavedSession({ uid, children }) {
  const [guestMergeIds] = useState(() => uid ? readGuestRecord().productIds : []);
  const [store] = useState(() => {
    const key = uid ? `udc:saved-pieces:account:${uid}` : GUEST_KEY;
    const initial = uid ? readAccountRecord(key) : readGuestRecord();
    return createSavedItemsStore({
      initial, idsField: "productIds", snapshotField: "savedIds", itemLabel: "saved pieces",
      persist(record) {
        return uid ? writeAccountRecord(key, record) : writeGuestRecord(record);
      },
      loadRemote: uid && db ? async () => {
        const snapshot = await getDoc(doc(db, "savedPieces", uid));
        if (snapshot.metadata.fromCache) throw new Error("Account pieces have not been confirmed by the server.");
        return snapshot.data()?.productIds || [];
      } : undefined,
      writeRemote: uid && db ? (id, saved) => setDoc(doc(db, "savedPieces", uid), { productIds: saved ? arrayUnion(id) : arrayRemove(id) }, { merge: true }) : undefined,
    });
  });
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    let cancelled = false;
    let mergeInFlight = null;
    store.start();

    function mergeGuestSaves() {
      if (!uid || !db || guestMergeIds.length === 0) return Promise.resolve();
      if (mergeInFlight) return mergeInFlight;

      mergeInFlight = (async () => {
        try {
          const validGuestIds = await validatePublishedProductIds(guestMergeIds);
          if (cancelled) return;

          // First reconcile the signed-in account from the server. If account
          // sync is unavailable, retain guest state untouched for a later retry.
          await store.retry();
          if (cancelled || store.getSnapshot().error) return;

          const currentAccountIds = store.getSnapshot().savedIds || [];
          const merged = mergeValidatedSavedIds(currentAccountIds, guestMergeIds, validGuestIds);
          const alreadySaved = new Set(currentAccountIds);
          const safelyProcessed = new Set(guestMergeIds.filter((id) => !validGuestIds.includes(id)));

          for (const id of merged) {
            if (cancelled) return;
            if (alreadySaved.has(id)) {
              if (validGuestIds.includes(id)) safelyProcessed.add(id);
              continue;
            }
            const result = await store.toggleConfirmed(id);
            if (result?.ok) {
              alreadySaved.add(id);
              safelyProcessed.add(id);
            }
          }

          if (cancelled || safelyProcessed.size === 0) return;
          const latestGuest = readGuestRecord();
          writeGuestRecord({
            productIds: latestGuest.productIds.filter((id) => !safelyProcessed.has(id)),
            pending: latestGuest.pending.filter((change) => !safelyProcessed.has(change?.id)),
          });
        } catch {
          // Keep guest saves intact. A later online event or account session
          // can retry validation without replacing existing account saves.
        } finally {
          mergeInFlight = null;
        }
      })();

      return mergeInFlight;
    }

    void mergeGuestSaves();

    const retry = () => {
      void store.retry();
      void mergeGuestSaves();
    };
    const onStorage = event => {
      if (!uid && (event.key === GUEST_KEY || event.key === null)) store.replaceGuestIds(readGuestRecord().productIds);
    };
    window.addEventListener("online", retry);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retry);
      window.removeEventListener("storage", onStorage);
    };
  }, [store, uid, guestMergeIds]);
  return <SavedPiecesContext.Provider value={{
    savedIds: state.savedIds,
    isSaved: id => state.savedIds.includes(id),
    toggleSaved: id => store.toggle(id)?.added ?? false,
    toggleSavedConfirmed: id => store.toggleConfirmed(id),
    retrySync: store.retry,
    isPersistent: !!uid && !!db,
    isReady: true,
    storage: state.storage,
    error: state.error,
  }}>{children}</SavedPiecesContext.Provider>;
}
export function useSavedPieces() { return useContext(SavedPiecesContext); }
