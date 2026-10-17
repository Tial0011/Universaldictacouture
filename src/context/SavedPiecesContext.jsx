<<<<<<< HEAD
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { arrayRemove, arrayUnion, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { createSavedItemsStore, reviewIds as itemIds } from "../services/savedReviewStore";
import { useAuth } from "./AuthContext";

const SavedPiecesContext = createContext({ savedIds: [], isSaved: () => false, toggleSaved: () => false, retrySync: () => {}, isPersistent: false, isReady: true, storage: "memory", error: "" });
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
  let raw;
  try { raw = sessionStorage.getItem(GUEST_KEY); } catch { /* blocked storage */ }
  return parseRecord(raw);
}
function writeAccountRecord(key, record) {
  const value = JSON.stringify(record);
  try { localStorage.setItem(key, value); return "browser"; }
  catch { try { sessionStorage.setItem(key, value); return "session"; } catch { return "memory"; } }
}
function writeGuestRecord(record) {
  try { sessionStorage.setItem(GUEST_KEY, JSON.stringify(record)); return "session"; }
  catch { return "memory"; }
=======
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
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
}
export function SavedPiecesProvider({ children }) {
  const { user, principal } = useCustomerSession();
  if (user) return <BoundPieces key={user.uid + ':' + user.epoch} principalUid={user.principalUid} epoch={user.epoch}>{children}</BoundPieces>;
  if (principal) return <SavedPiecesContext.Provider value={unavailable}>{children}</SavedPiecesContext.Provider>;
  return <GuestPieces>{children}</GuestPieces>;
}
<<<<<<< HEAD
function SavedSession({ uid, children }) {
  const [store] = useState(() => {
    const key = uid ? `udc:saved-pieces:account:${uid}` : GUEST_KEY;
    const initial = uid ? readAccountRecord(key) : readGuestRecord();
    const guestIds = uid ? readGuestRecord().productIds : [];
    if (guestIds.length) {
      initial.productIds = itemIds([...initial.productIds, ...guestIds]);
      initial.pending = [...initial.pending, ...guestIds.map(id => ({ id, saved: true }))];
    }
    let guestCopied = false;
    return createSavedItemsStore({
      initial, idsField: "productIds", snapshotField: "savedIds", itemLabel: "saved pieces",
      persist(record) {
        const storage = uid ? writeAccountRecord(key, record) : writeGuestRecord(record);
        if (uid && guestIds.length && !guestCopied && storage !== "memory") {
          writeGuestRecord({ productIds: readGuestRecord().productIds.filter(id => !guestIds.includes(id)), pending: [] });
          guestCopied = true;
        }
        return storage;
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
    store.start();
    const retry = () => { void store.retry(); };
    const onStorage = event => {
      if (!uid && (event.key === GUEST_KEY || event.key === null)) store.replaceGuestIds(readGuestRecord().productIds);
    };
    window.addEventListener("online", retry);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("online", retry); window.removeEventListener("storage", onStorage); };
  }, [store, uid]);
  return <SavedPiecesContext.Provider value={{
    savedIds: state.savedIds,
    isSaved: id => state.savedIds.includes(id),
    toggleSaved: id => store.toggle(id)?.added ?? false,
    retrySync: store.retry,
    isPersistent: !!uid && !!db,
    isReady: true,
    storage: state.storage,
    error: state.error,
  }}>{children}</SavedPiecesContext.Provider>;
=======
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
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
}
export function useSavedPieces() { return useContext(SavedPiecesContext); }
