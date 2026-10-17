import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { auth } from "../firebase/auth";
import { resolveCustomerAccount } from "../services/accountApi";
import { flushSync } from "react-dom";
export function useCustomerSession() {
  const principal = useAuth();
  const uid = principal.user?.uid;
  const [source, setSource] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!uid || !db) return;
    let live = true, generation = 0, stopSession = () => {};
    const clear = () => { if (!live) return; generation++; flushSync(() => setSource(null)); };
    const load = () => {
      const ticket = ++generation;
      resolveCustomerAccount({ uid }).then(value => {
        if (live && ticket === generation && auth.currentUser?.uid === uid) setSource({ uid, value });
      }).catch(error => {
        if (live && ticket === generation && auth.currentUser?.uid === uid) setSource({ uid, errorState: ["session-revoked", "fresh-auth-required", "session-required"].includes(error.code) ? "revoked" : error.code === "account-restricted" ? "restricted" : error.code === "account-deleted" ? "deleted" : "unavailable" });
      });
    };
    load();
    const stop = onSnapshot(doc(db, "customerAccess", uid), { includeMetadataChanges: true }, snapshot => {
      clear(); if (!snapshot.metadata.fromCache) load();
    }, clear);
    const uncertain = () => { clear(); };
    const restore = event => { if (event.persisted) { clear(); load(); } };
    const online = () => { clear(); load(); };
    const followSession = sessionRef => {
      if (typeof sessionRef !== "string" || !/^[a-f0-9]{64}$/.test(sessionRef)) return;
      let awaiting = false;
      stopSession(); stopSession = onSnapshot(doc(db, "sessionAccess", sessionRef), { includeMetadataChanges: true }, snapshot => {
        if (!live || auth.currentUser?.uid !== uid) return;
        if (snapshot.metadata.fromCache) { awaiting = true; clear(); return; }
        if (!snapshot.exists() || snapshot.data().uid !== uid || snapshot.data().active !== true) clear();
        else if (awaiting) { awaiting = false; load(); }
      }, clear);
    };
    const established = event => { if (event.detail?.uid === uid && event.detail?.kind === "customer") followSession(event.detail.sessionRef); };
    try { followSession(sessionStorage.getItem(`udc:managed-session:${uid}:customer:ref`)); } catch { /* non-authorizing revalidation pointer */ }
    window.addEventListener("udc:account:session-established", established);
    window.addEventListener("udc:account:authority-uncertain", uncertain);
    window.addEventListener("pageshow", restore); window.addEventListener("online", online); window.addEventListener("offline", uncertain);
    return () => { live = false; generation++; stop(); stopSession(); window.removeEventListener("udc:account:session-established", established); window.removeEventListener("udc:account:authority-uncertain", uncertain); window.removeEventListener("pageshow", restore); window.removeEventListener("online", online); window.removeEventListener("offline", uncertain); };
  }, [uid, attempt]);
  const value = uid && source?.uid === uid && source?.value?.authorized && source.value.principalUid === uid ? source.value : null;
  const customerPrincipal = value ? { uid: value.accountId, accountId: value.accountId, principalUid: uid, epoch: value.epoch } : null;
  return { ...principal, principal: principal.user, principalKind: customerPrincipal ? "customer" : principal.user ? "provider" : "guest", customerPrincipal,
    user: customerPrincipal, accountState: value ? "active" : principal.user ? source?.uid === uid ? source.errorState || (source.value?.lifecycle === "RESTRICTED" ? "restricted" : source.value?.lifecycle?.startsWith("DELETED-") ? "deleted" : "unavailable") : "checking" : principal.sessionState,
    recheckCustomer: () => { setSource(null); setAttempt(current => current + 1); } };
}
