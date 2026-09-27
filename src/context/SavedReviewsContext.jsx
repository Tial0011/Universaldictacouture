import { createContext, useContext, useEffect, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { useAuth } from "./AuthContext";

const SavedReviewsContext = createContext({
  savedReviewIds: [],
  isReviewSaved: () => false,
  toggleSavedReview: async () => null,
  isPersistent: false,
  isReady: true,
  error: "",
});

const GUEST_KEY = "udc:saved-reviews";
const LEGACY_GUEST_KEY = "udc:saved-reviews:session";

function readGuest() {
  try {
    const stored = localStorage.getItem(GUEST_KEY) ?? sessionStorage.getItem(LEGACY_GUEST_KEY);
    const ids = JSON.parse(stored || "[]");
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    try {
      const ids = JSON.parse(sessionStorage.getItem(LEGACY_GUEST_KEY) || "[]");
      return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
    } catch { return []; }
  }
}

function clearGuest() {
  try { localStorage.removeItem(GUEST_KEY); } catch { /* storage may be blocked */ }
  try { sessionStorage.removeItem(LEGACY_GUEST_KEY); } catch { /* storage may be blocked */ }
}

export function SavedReviewsProvider({ children }) {
  const { user } = useAuth();
  return <SavedReviewsSession key={user?.uid || "guest"} uid={user?.uid}>{children}</SavedReviewsSession>;
}

function SavedReviewsSession({ uid, children }) {
  const [savedReviewIds, setSavedReviewIds] = useState(() => uid ? [] : readGuest());
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(!uid);
  const latest = useRef(savedReviewIds);
  const committed = useRef(savedReviewIds);
  const ready = useRef(!uid);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    if (uid) return;
    try {
      if (localStorage.getItem(GUEST_KEY) === null && latest.current.length) {
        localStorage.setItem(GUEST_KEY, JSON.stringify(latest.current));
      }
    } catch { /* browser storage may be blocked */ }
    const onStorage = (event) => {
      if (event.key !== GUEST_KEY) return;
      let ids = [];
      try {
        const parsed = JSON.parse(event.newValue || "[]");
        if (Array.isArray(parsed)) ids = parsed.filter((id) => typeof id === "string");
      } catch { /* ignore malformed data from another tab */ }
      latest.current = ids;
      committed.current = ids;
      setSavedReviewIds(ids);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [uid]);

  useEffect(() => {
    if (!uid || !db) return;
    let active = true;
    getDoc(doc(db, "savedReviews", uid)).then((snapshot) => {
      if (!active) return;
      const ids = snapshot.data()?.reviewIds;
      const accountIds = Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
      const guestIds = readGuest();
      const merged = [...new Set([...accountIds, ...guestIds])];
      latest.current = merged;
      committed.current = accountIds;
      setSavedReviewIds(latest.current);
      ready.current = true;
      setIsReady(true);
      if (merged.length !== accountIds.length) {
        writes.current = writes.current
          .then(() => setDoc(doc(db, "savedReviews", uid), { reviewIds: merged }))
          .then(() => { committed.current = merged; if (active) clearGuest(); })
          .catch(() => setError("Your bookmarked reviews are visible here, but could not sync to your account. Please try again later."));
      } else if (guestIds.length) {
        clearGuest();
      }
    }).catch(() => {
      if (active) setError("Saved reviews could not be loaded. Refresh to try again.");
    });
    return () => { active = false; };
  }, [uid]);

  function toggleSavedReview(id) {
    if (!ready.current) {
      setError("Saved reviews are still loading. Please wait a moment.");
      return Promise.resolve(null);
    }
    const adding = !latest.current.includes(id);
    const next = adding ? [...latest.current, id] : latest.current.filter((value) => value !== id);
    latest.current = next;
    setSavedReviewIds(next);
    setError("");

    if (uid && db) {
      writes.current = writes.current
        .then(() => setDoc(doc(db, "savedReviews", uid), { reviewIds: next }))
        .then(() => {
          committed.current = next;
          clearGuest();
          if (latest.current === next) setError("");
          return adding;
        })
        .catch(() => {
          if (latest.current === next) {
            latest.current = committed.current;
            setSavedReviewIds(committed.current);
          }
          setError("That saved-review change could not be stored. Check your connection and try again.");
          return null;
        });
      return writes.current;
    } else {
      try { localStorage.setItem(GUEST_KEY, JSON.stringify(next)); }
      catch {
        try { sessionStorage.setItem(LEGACY_GUEST_KEY, JSON.stringify(next)); } catch { /* memory-only fallback */ }
      }
    }
    return Promise.resolve(adding);
  }

  return <SavedReviewsContext.Provider value={{
    savedReviewIds,
    isReviewSaved: (id) => savedReviewIds.includes(id),
    toggleSavedReview,
    isPersistent: !!uid && !!db,
    isReady,
    error,
  }}>{children}</SavedReviewsContext.Provider>;
}

export function useSavedReviews() {
  return useContext(SavedReviewsContext);
}
