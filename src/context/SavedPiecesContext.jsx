import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { isFirebaseConfigured } from "../firebase/config";
import { useAuth } from "./AuthContext";

/**
 * Saved Pieces.
 *
 * Guests get session-only Saved Pieces — held in sessionStorage so
 * they survive navigation and refresh within the visit, and honestly
 * described as temporary in the UI. Signed-in Profile visitors get
 * persistence in Firestore under their own document.
 */

const STORAGE_KEY = "udc:saved-pieces";

const SavedPiecesContext = createContext({
  savedIds: [],
  isSaved: () => false,
  toggleSaved: () => {},
  isPersistent: false,
});

function readSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeSession(ids) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable (private mode / blocked). Saved
    // Pieces then live in memory for this page only, which is still
    // truthful for a guest.
  }
}

export function SavedPiecesProvider({ children }) {
  const { user } = useAuth();
  const [savedIds, setSavedIds] = useState(() => readSession());
  const isPersistent = Boolean(user) && isFirebaseConfigured;

  // Load the signed-in visitor's stored Saved Pieces.
  useEffect(() => {
    if (!isPersistent) return undefined;
    let active = true;

    getDoc(doc(db, "savedPieces", user.uid))
      .then((snapshot) => {
        if (!active) return;
        const stored = snapshot.exists() ? snapshot.data()?.productIds : null;
        const merged = Array.from(
          new Set([...(Array.isArray(stored) ? stored : []), ...readSession()])
        );
        setSavedIds(merged);
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.error(error);
      });

    return () => {
      active = false;
    };
  }, [isPersistent, user]);

  const persist = useCallback(
    (ids) => {
      writeSession(ids);
      if (!isPersistent) return;
      setDoc(doc(db, "savedPieces", user.uid), { productIds: ids }, { merge: true }).catch(
        (error) => {
          if (import.meta.env.DEV) console.error(error);
        }
      );
    },
    [isPersistent, user]
  );

  const toggleSaved = useCallback(
    (productId) => {
      if (!productId) return false;
      let nowSaved = false;
      setSavedIds((previous) => {
        const exists = previous.includes(productId);
        nowSaved = !exists;
        const next = exists
          ? previous.filter((id) => id !== productId)
          : [...previous, productId];
        persist(next);
        return next;
      });
      return nowSaved;
    },
    [persist]
  );

  const value = useMemo(
    () => ({
      savedIds,
      isSaved: (productId) => savedIds.includes(productId),
      toggleSaved,
      isPersistent,
    }),
    [savedIds, toggleSaved, isPersistent]
  );

  return <SavedPiecesContext.Provider value={value}>{children}</SavedPiecesContext.Provider>;
}

export function useSavedPieces() {
  return useContext(SavedPiecesContext);
}
