import { createContext, useContext, useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { createSavedItemsStore, reviewIds } from "../services/savedReviewStore";
import { useCustomerSession } from "../hooks/useCustomerSession";
import { useBoundSaves } from "../hooks/useBoundSaves";
import { accountRequest } from "../services/accountApi";
const unavailable = { savedIds: [], isSaved: () => false, toggleSaved: () => false, toggleSavedConfirmed: async () => ({ ok: false }), retrySync: () => {}, isPersistent: false, isReady: false, storage: "unavailable", error: "Checking account access…" };
const SavedPiecesContext = createContext(unavailable);
const GUEST_KEY = "udc:saved-pieces:guest";
function readGuest() {
  const ids = [];
  for (const name of ["localStorage", "sessionStorage"]) {
    try { const value = JSON.parse(globalThis[name].getItem(GUEST_KEY) || "{}"); ids.push(...reviewIds(Array.isArray(value) ? value : value.productIds)); } catch { /* Guest positive intent only. */ }
  }
  return reviewIds(ids);
}
function writeGuest(record) {
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(record)); sessionStorage.removeItem(GUEST_KEY); return "browser"; }
  catch { try { sessionStorage.setItem(GUEST_KEY, JSON.stringify(record)); return "session"; } catch { return "memory"; } }
}
export function SavedPiecesProvider({ children }) {
  const { user, principal } = useCustomerSession();
  if (user) return <BoundPieces key={user.uid + ':' + user.epoch} principalUid={user.principalUid} epoch={user.epoch}>{children}</BoundPieces>;
  if (principal) return <SavedPiecesContext.Provider value={unavailable}>{children}</SavedPiecesContext.Provider>;
  return <GuestPieces>{children}</GuestPieces>;
}
function BoundPieces({ principalUid, epoch, children }) {
  const state = useBoundSaves(principalUid, "piece");
  const [guestIntents] = useState(() => readGuest().map(objectId => ({ objectId, operationId: crypto.randomUUID() })));
  const refresh = useEffectEvent(() => { void state.retry(); });
  useEffect(() => {
    let live = true;
    (async () => {
      for (const intent of guestIntents) {
        try {
          await accountRequest("guest-import", { operationId: intent.operationId, expectedEpoch: epoch, intent: { kind: "saved-piece", objectId: intent.objectId, positive: true } }, { principalUid });
          if (!live) return;
          writeGuest({ productIds: readGuest().filter(id => id !== intent.objectId), pending: [] });
        } catch { return; } // Retain unknown intent; never transfer private data.
      }
      if (live && guestIntents.length) refresh();
    })();
    return () => { live = false; };
  }, [guestIntents, principalUid, epoch]);
  return <SavedPiecesContext.Provider value={{ savedIds: state.ids, isSaved: id => state.ids.includes(id), toggleSaved: id => { void state.toggleConfirmed(id); return !state.ids.includes(id); }, toggleSavedConfirmed: state.toggleConfirmed, retrySync: state.retry, isPersistent: true, isReady: state.ready, storage: "account", error: state.error }}>{children}</SavedPiecesContext.Provider>;
}
function GuestPieces({ children }) {
  const [store] = useState(() => createSavedItemsStore({ initial: { productIds: readGuest() }, idsField: "productIds", snapshotField: "savedIds", itemLabel: "saved pieces", persist: writeGuest }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.start(); const changed = event => { if (event.key === GUEST_KEY || event.key == null) store.replaceGuestIds(readGuest()); };
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, [store]);
  return <SavedPiecesContext.Provider value={{ savedIds: state.savedIds, isSaved: id => state.savedIds.includes(id), toggleSaved: id => store.toggle(id)?.added ?? false, toggleSavedConfirmed: store.toggleConfirmed, retrySync: store.retry, isPersistent: false, isReady: true, storage: state.storage, error: state.error }}>{children}</SavedPiecesContext.Provider>;
}
export function useSavedPieces() { return useContext(SavedPiecesContext); }
