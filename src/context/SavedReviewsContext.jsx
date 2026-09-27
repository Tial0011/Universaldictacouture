import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { arrayRemove, arrayUnion, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { createSavedReviewStore, reviewIds } from "../services/savedReviewStore";
import { useAuth } from "./AuthContext";

const SavedReviewsContext = createContext({
  savedReviewIds: [],
  isReviewSaved: () => false,
  toggleSavedReview: () => null,
  retrySync: () => {},
  isPersistent: false,
  isReady: true,
  error: "",
});

const GUEST_KEY = "udc:saved-reviews";
const LEGACY_GUEST_KEY = "udc:saved-reviews:session";

function readRecord(key) {
  let raw;
  try { raw = localStorage.getItem(key); } catch { /* storage may be blocked */ }
  if (raw == null) {
    try { raw = sessionStorage.getItem(key) || (key === GUEST_KEY ? sessionStorage.getItem(LEGACY_GUEST_KEY) : null); } catch { /* storage may be blocked */ }
  }
  try {
    const record = JSON.parse(raw || "{}");
    return {
      reviewIds: reviewIds(Array.isArray(record) ? record : record?.reviewIds),
      pending: Array.isArray(record?.pending) ? record.pending : [],
    };
  } catch { return { reviewIds: [], pending: [] }; }
}

function writeRecord(key, record) {
  const value = JSON.stringify(record);
  try {
    localStorage.setItem(key, value);
    try { sessionStorage.removeItem(key); } catch { /* optional old fallback cleanup */ }
    return "browser";
  } catch {
    try { sessionStorage.setItem(key, value); return "session"; } catch { return "memory"; }
  }
}

export function SavedReviewsProvider({ children }) {
  const { user } = useAuth();
  return <SavedReviewsSession key={user?.uid || "guest"} uid={user?.uid}>{children}</SavedReviewsSession>;
}

function SavedReviewsSession({ uid, children }) {
  const [store] = useState(() => {
    const key = uid ? `udc:saved-reviews:account:${uid}` : GUEST_KEY;
    const initial = readRecord(key);
    const guestIds = uid ? readRecord(GUEST_KEY).reviewIds : [];
    if (guestIds.length) {
      initial.reviewIds = reviewIds([...initial.reviewIds, ...guestIds]);
      initial.pending = [...initial.pending, ...guestIds.map((id) => ({ id, saved: true }))];
    }
    let guestCopied = false;
    return createSavedReviewStore({
      initial,
      persist(record) {
        const storage = writeRecord(key, record);
        // Transfer only the captured guest bookmarks after the account copy is durable.
        if (guestIds.length && !guestCopied && storage !== "memory") {
          const remaining = readRecord(GUEST_KEY).reviewIds.filter((id) => !guestIds.includes(id));
          writeRecord(GUEST_KEY, { reviewIds: remaining, pending: [] });
          try { sessionStorage.removeItem(LEGACY_GUEST_KEY); } catch { /* optional cleanup */ }
          guestCopied = true;
        }
        return storage;
      },
      loadRemote: uid && db ? async () => {
        const snapshot = await getDoc(doc(db, "savedReviews", uid));
        if (snapshot.metadata.fromCache) throw new Error("Account bookmarks have not been confirmed by the server.");
        return snapshot.data()?.reviewIds || [];
      } : undefined,
      writeRemote: uid && db ? (id, saved) => setDoc(
        doc(db, "savedReviews", uid),
        { reviewIds: saved ? arrayUnion(id) : arrayRemove(id) },
        { merge: true },
      ) : undefined,
    });
  });
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    store.start();
    const retry = () => { void store.retry(); };
    const onStorage = (event) => {
      if (!uid && (event.key === GUEST_KEY || event.key === null)) {
        store.replaceGuestIds(readRecord(GUEST_KEY).reviewIds);
      }
    };
    window.addEventListener("online", retry);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("storage", onStorage);
    };
  }, [store, uid]);

  return <SavedReviewsContext.Provider value={{
    savedReviewIds: state.savedReviewIds,
    isReviewSaved: (id) => state.savedReviewIds.includes(id),
    toggleSavedReview: store.toggle,
    retrySync: store.retry,
    isPersistent: !!uid && !!db,
    // Local storage is immediately ready, regardless of the account connection.
    isReady: true,
    error: state.error,
  }}>{children}</SavedReviewsContext.Provider>;
}

export function useSavedReviews() {
  return useContext(SavedReviewsContext);
}
