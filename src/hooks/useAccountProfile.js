import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { auth } from "../firebase/auth";
import { db } from "../firebase/firestore";
import { fetchCustomerProfile } from "../services/customerProfile";
import { identityBoundRequests, personalDetailsProjection } from "../services/profileExperience";

export function useAccountProfile(uid, attempt = 0) {
  const [source, setSource] = useState({ uid: null, state: "loading", profile: null });
  const requests = useRef(identityBoundRequests());
  useEffect(() => {
    const scope = requests.current; let live = true, signature = null, stopSession = () => {};
    scope.reset(uid);
    if (!uid || !db) return () => { scope.reset(null); };
    const load = () => {
      const ticket = scope.begin("profile");
      fetchCustomerProfile(uid).then(value => {
        if (live && scope.current(ticket) && auth.currentUser?.uid === uid) setSource({ uid, state: "loaded", profile: personalDetailsProjection(value), accountId: value.accountId, epoch: value.epoch, version: value.version });
      }).catch(error => {
        if (!live || !scope.current(ticket) || auth.currentUser?.uid !== uid) return;
        const state = error.code === "account-restricted" ? "restricted" : error.code === "account-deleted" ? "deleted" : error.code === "session-revoked" ? "revoked" : "unavailable";
        flushSync(() => setSource({ uid, state, profile: null }));
      });
    };
    load();
    const stop = onSnapshot(doc(db, "customerAccess", uid), { includeMetadataChanges: true }, snapshot => {
      if (!live || auth.currentUser?.uid !== uid) return;
      const value = snapshot.exists() ? snapshot.data() : null;
      const next = JSON.stringify([value?.accountId, value?.epoch, value?.lifecycle, value?.available]);
      if (snapshot.metadata.fromCache) {
        scope.reset(uid); flushSync(() => setSource({ uid, state: "loading", profile: null })); return;
      }
      if (next === signature) return;
      signature = next;
      // The projection only withdraws/revalidates. It never supplies Profile
      // fields, creates durable identity or grants a private operation.
      scope.reset(uid); flushSync(() => setSource({ uid, state: "loading", profile: null })); load();
    }, () => { if (live) { scope.reset(uid); flushSync(() => setSource({ uid, state: "unavailable", profile: null })); } });
    const uncertain = () => { if (live) { scope.reset(uid); flushSync(() => setSource({ uid, state: "unverifiable", profile: null })); } };
    const followSession = sessionRef => {
      if (typeof sessionRef !== "string" || !/^[a-f0-9]{64}$/.test(sessionRef)) return;
      let awaitingCurrent = false;
      stopSession(); stopSession = onSnapshot(doc(db, "sessionAccess", sessionRef), { includeMetadataChanges: true }, snapshot => {
        if (!live || auth.currentUser?.uid !== uid) return;
        if (snapshot.metadata.fromCache) { awaitingCurrent = true; uncertain(); return; }
        if (!snapshot.exists() || snapshot.data().uid !== uid || snapshot.data().active !== true) uncertain();
        else if (awaitingCurrent) { awaitingCurrent = false; load(); }
      }, uncertain);
    };
    const established = event => { if (event.detail?.uid === uid && event.detail?.kind === "customer") followSession(event.detail.sessionRef); };
    window.addEventListener("udc:account:authority-uncertain", uncertain); window.addEventListener("udc:account:session-established", established);
    try { followSession(sessionStorage.getItem(`udc:managed-session:${uid}:customer:ref`)); } catch { /* optional */ }
    return () => { live = false; stop(); stopSession(); window.removeEventListener("udc:account:authority-uncertain", uncertain); window.removeEventListener("udc:account:session-established", established); scope.reset(null); };
  }, [uid, attempt]);
  return source.uid === uid ? source : { uid, state: "loading", profile: null };
}
