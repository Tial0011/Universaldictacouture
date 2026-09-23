import { createContext, useContext, useEffect, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { useAuth } from "./AuthContext";
const SavedPiecesContext = createContext({ savedIds: [], isSaved: () => false, toggleSaved: () => false, isPersistent: false, error: "" });
function readGuest() {
  try { const ids = JSON.parse(sessionStorage.getItem("udc:saved-pieces:guest") || "[]"); return Array.isArray(ids) ? ids.filter(id => typeof id === "string") : []; }
  catch { return []; }
}
export function SavedPiecesProvider({ children }) {
  const { user } = useAuth();
  return <SavedSession key={user?.uid || "guest"} uid={user?.uid}>{children}</SavedSession>;
}
function SavedSession({ uid, children }) {
  const [savedIds, setSavedIds] = useState(() => uid ? [] : readGuest());
  const [error, setError] = useState("");
  const latest = useRef(savedIds);
  const ready = useRef(!uid);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    if (!uid || !db) return;
    let active = true;
    getDoc(doc(db, "savedPieces", uid)).then(snapshot => {
      if (!active) return;
      const ids = snapshot.data()?.productIds;
      latest.current = Array.isArray(ids) ? ids.filter(id => typeof id === "string") : [];
      setSavedIds(latest.current); ready.current = true;
    }).catch(() => { if (active) setError("Your pieces could not be loaded. Refresh to try again."); });
    return () => { active = false; };
  }, [uid]);
  function toggleSaved(id) {
    if (!ready.current) { setError("Your pieces are not ready yet. Please wait or refresh to retry."); return false; }
    const adding = !latest.current.includes(id);
    const next = adding ? [...latest.current, id] : latest.current.filter(value => value !== id);
    latest.current = next; setSavedIds(next); setError("");
    if (uid && db) {
      writes.current = writes.current.then(() => setDoc(doc(db,"savedPieces",uid),{productIds:next}))
        .catch(() => { setError("Changes could not be saved to your account. Check your connection and try again."); });
    } else {
      try { sessionStorage.setItem("udc:saved-pieces:guest",JSON.stringify(next)); } catch { /* Memory-only guest session. */ }
    }
    return adding;
  }
  return <SavedPiecesContext.Provider value={{ savedIds, isSaved: id => savedIds.includes(id), toggleSaved, isPersistent: !!uid && !!db, error }}>{children}</SavedPiecesContext.Provider>;
}
export function useSavedPieces() { return useContext(SavedPiecesContext); }
