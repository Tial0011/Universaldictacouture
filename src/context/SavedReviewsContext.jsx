import { createContext, useContext, useEffect, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { useAuth } from "./AuthContext";

const SavedReviewsContext = createContext({
  savedReviewIds: [],
  isReviewSaved: () => false,
  toggleSavedReview: () => false,
  isPersistent: false,
  error: "",
});

const GUEST_KEY = "udc:saved-reviews:session";

function readGuest() {
  try {
    const ids = JSON.parse(sessionStorage.getItem(GUEST_KEY) || "[]");
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function SavedReviewsProvider({ children }) {
  const { user } = useAuth();
  return <SavedReviewsSession key={user?.uid || "guest"} uid={user?.uid}>{children}</SavedReviewsSession>;
}

function SavedReviewsSession({ uid, children }) {
  const [savedReviewIds, setSavedReviewIds] = useState(() => uid ? [] : readGuest());
  const [error, setError] = useState("");
  const latest = useRef(savedReviewIds);
  const ready = useRef(!uid);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    if (!uid || !db) return;
    let active = true;
    getDoc(doc(db, "savedReviews", uid)).then((snapshot) => {
      if (!active) return;
      const ids = snapshot.data()?.reviewIds;
      latest.current = Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
      setSavedReviewIds(latest.current);
      ready.current = true;
    }).catch(() => {
      if (active) setError("Saved reviews could not be loaded. Refresh to try again.");
    });
    return () => { active = false; };
  }, [uid]);

  function toggleSavedReview(id) {
    if (!ready.current) {
      setError("Saved reviews are still loading. Please wait a moment.");
      return false;
    }
    const adding = !latest.current.includes(id);
    const next = adding ? [...latest.current, id] : latest.current.filter((value) => value !== id);
    latest.current = next;
    setSavedReviewIds(next);
    setError("");

    if (uid && db) {
      writes.current = writes.current
        .then(() => setDoc(doc(db, "savedReviews", uid), { reviewIds: next }))
        .catch(() => setError("That saved-review change could not be stored. Check your connection and try again."));
    } else {
      try { sessionStorage.setItem(GUEST_KEY, JSON.stringify(next)); } catch { /* memory-only guest session */ }
    }
    return adding;
  }

  return <SavedReviewsContext.Provider value={{
    savedReviewIds,
    isReviewSaved: (id) => savedReviewIds.includes(id),
    toggleSavedReview,
    isPersistent: !!uid && !!db,
    error,
  }}>{children}</SavedReviewsContext.Provider>;
}

export function useSavedReviews() {
  return useContext(SavedReviewsContext);
}
