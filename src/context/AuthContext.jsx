import { createContext, Fragment, useContext, useEffect, useLayoutEffect, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import { auth, expireSession, revalidateFirebasePrincipal, sessionPolicyExpired, subscribeToAuthChanges } from "../firebase/auth";
import { safeNavigationState, clearAuthContinuations } from "../services/authFlow";

const AuthContext = createContext({ user: null, isLoading: true, sessionExpired: false, sessionState: "checking", recheckSession: async () => {} });
const SESSION_MARKER = "udc:auth:had-session";
const INTENTIONAL_SIGNOUT_MARKER = "udc:auth:intentional-signout";

function sessionValue(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function setSessionValue(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Session metadata is only a UX aid; Firebase remains authoritative.
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionState, setSessionState] = useState("checking");
  const [attempt, setAttempt] = useState(0);
  const [verificationRevision, setVerificationRevision] = useState(0);
  const recheckSession = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    let live = true;
    let generation = 0;
    let knownReason = "";
    let lastPrincipalUid = null;
    let verifiedPrincipalUid = null;
    const resolve = async (nextUser, { preserveCurrent = false, synchronous = false } = {}) => {
      // An out-of-order provider notification is not a new principal. Do not
      // let old A/null callbacks tear down an already established current B.
      if ((nextUser?.uid || null) !== (auth?.currentUser?.uid || null)) return;
      const version = ++generation;
      if (lastPrincipalUid && nextUser?.uid !== lastPrincipalUid) clearAuthContinuations();
      const expired = Boolean(nextUser && sessionPolicyExpired());
      // Routine successful same-principal checks do not destroy local unsent
      // work. This preserves presentation only; protected commits still check
      // current trusted authority. Switch/BFCache/offline/recheck always shield.
      const keepPresentation = preserveCurrent && !expired && nextUser?.uid
        && nextUser.uid === verifiedPrincipalUid && auth?.currentUser?.uid === nextUser.uid;
      if (window.history.state?.usr) window.history.replaceState({ ...window.history.state, usr: safeNavigationState(window.history.state.usr) }, "", window.location.href);
      if (!keepPresentation) {
        verifiedPrincipalUid = null;
        const withdraw = () => { setUser(null); setIsLoading(Boolean(nextUser)); setSessionState(nextUser ? "checking" : "guest"); };
        if (synchronous || expired) flushSync(withdraw); else withdraw();
      }
      if (nextUser) {
        lastPrincipalUid = nextUser.uid;
        if (expired) {
          setSessionValue(SESSION_MARKER, "1");
          setSessionExpired(true);
          setUser(null);
          setIsLoading(false);
          setSessionState("expired"); knownReason = "expired";
          void expireSession().catch(() => {});
          return;
        }
        try { nextUser = await revalidateFirebasePrincipal(nextUser); }
        catch (error) {
          if (!live) return;
          const revoked = ["auth/user-disabled", "auth/user-token-expired", "auth/invalid-user-token", "auth/user-not-found"].includes(error?.code);
          // Firebase can clear the principal before surfacing its server denial.
          // Preserve that confirmed reason without letting an old A error
          // overwrite B or an intentional sign-out/expiry.
          if (version !== generation && !(revoked && !auth?.currentUser && lastPrincipalUid === nextUser.uid && !["signed-out", "expired"].includes(knownReason))) return;
          if (revoked) knownReason = "revoked";
          verifiedPrincipalUid = null;
          flushSync(() => { setUser(null); setIsLoading(false); setSessionState(revoked ? "revoked" : "unverifiable"); }); return;
        }
        if (!live || version !== generation) return;
        setSessionValue(SESSION_MARKER, "1");
        setSessionValue(INTENTIONAL_SIGNOUT_MARKER, null);
        setSessionExpired(false);
        setSessionState("authenticated"); knownReason = "";
        verifiedPrincipalUid = nextUser.uid;
        // Firebase can refresh metadata on the same User object. Re-render
        // confirmed values without remounting the identity-scoped subtree.
        setVerificationRevision(value => value + 1);
      } else {
        const intentionalAt = Number(sessionValue(INTENTIONAL_SIGNOUT_MARKER) || 0);
        const intentional = intentionalAt > 0 && Date.now() - intentionalAt < 15000;
        if (intentional) {
          setSessionValue(SESSION_MARKER, null);
          setSessionValue(INTENTIONAL_SIGNOUT_MARKER, null);
          setSessionExpired(false);
          setSessionState("signed-out"); knownReason = "signed-out";
        } else {
          setSessionExpired(knownReason === "expired");
          setSessionState(knownReason || (sessionValue(SESSION_MARKER) === "1" ? "session-ended" : "guest"));
        }
      }
      setUser(nextUser);
      setIsLoading(false);
    };
    const unsubscribe = subscribeToAuthChanges(next => { if (live) void resolve(next, { synchronous: Boolean(lastPrincipalUid) }); });
    const refresh = () => { if (document.visibilityState === "visible") void resolve(auth?.currentUser, { synchronous: true }); };
    const restored = event => { if (event.persisted) refresh(); };
    const signedOut = () => { void resolve(auth?.currentUser, { synchronous: true }); };
    const offline = () => { generation++; verifiedPrincipalUid = null; flushSync(() => { setUser(null); setIsLoading(false); setSessionState("unverifiable"); }); };
    window.addEventListener("online", refresh); window.addEventListener("offline", offline); window.addEventListener("pageshow", restored); window.addEventListener("udc:auth:signed-out", signedOut); document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(() => { if (auth?.currentUser && document.visibilityState === "visible") void resolve(auth.currentUser, { preserveCurrent: true }); }, 60000);
    return () => { live = false; generation++; unsubscribe(); clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("offline", offline); window.removeEventListener("pageshow", restored); window.removeEventListener("udc:auth:signed-out", signedOut); document.removeEventListener("visibilitychange", refresh); };
  }, [attempt]);

  const focusUid = user?.uid;
  useLayoutEffect(() => {
    if (focusUid || !["checking", "unverifiable", "revoked", "expired", "session-ended", "signed-out"].includes(sessionState)) return;
    // React has already removed the old identity subtree. Focus current safe
    // semantic content, never a detached private control or blurred old DOM.
    const target = document.querySelector("main h1") || document.querySelector("main");
    if (target) { target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
  }, [focusUid, sessionState]);

  return (
    <AuthContext.Provider value={{ user, isLoading, sessionExpired, sessionState, recheckSession, verificationRevision }}>
      <Fragment key={user?.uid || sessionState}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
