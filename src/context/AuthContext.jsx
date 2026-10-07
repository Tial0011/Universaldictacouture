import { createContext, Fragment, useContext, useEffect, useState, useCallback } from "react";
import { auth, expireSession, revalidateFirebasePrincipal, sessionPolicyExpired, subscribeToAuthChanges } from "../firebase/auth";
import { safeNavigationState } from "../services/authFlow";

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
  const recheckSession = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    let live = true;
    let generation = 0;
    let knownReason = "";
    let lastPrincipalUid = null;
    const resolve = async (nextUser) => {
      const version = ++generation;
      if (window.history.state?.usr) window.history.replaceState({ ...window.history.state, usr: safeNavigationState(window.history.state.usr) }, "", window.location.href);
      setUser(null); setIsLoading(Boolean(nextUser)); setSessionState(nextUser ? "checking" : "guest");
      if (nextUser) {
        lastPrincipalUid = nextUser.uid;
        if (sessionPolicyExpired()) {
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
          setUser(null); setIsLoading(false); setSessionState(revoked ? "revoked" : "unverifiable"); return;
        }
        if (!live || version !== generation) return;
        setSessionValue(SESSION_MARKER, "1");
        setSessionValue(INTENTIONAL_SIGNOUT_MARKER, null);
        setSessionExpired(false);
        setSessionState("authenticated"); knownReason = "";
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
    const unsubscribe = subscribeToAuthChanges(next => { if (live) void resolve(next); });
    const refresh = () => { if (document.visibilityState === "visible") void resolve(auth?.currentUser); };
    const restored = event => { if (event.persisted) refresh(); };
    const signedOut = () => { void resolve(auth?.currentUser); };
    const offline = () => { generation++; setUser(null); setIsLoading(false); setSessionState("unverifiable"); };
    window.addEventListener("online", refresh); window.addEventListener("offline", offline); window.addEventListener("pageshow", restored); window.addEventListener("udc:auth:signed-out", signedOut); document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(() => { if (auth?.currentUser) refresh(); }, 60000);
    return () => { live = false; generation++; unsubscribe(); clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("offline", offline); window.removeEventListener("pageshow", restored); window.removeEventListener("udc:auth:signed-out", signedOut); document.removeEventListener("visibilitychange", refresh); };
  }, [attempt]);

  return (
    <AuthContext.Provider value={{ user, isLoading, sessionExpired, sessionState, recheckSession }}>
      <Fragment key={user?.uid || sessionState}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
