import { createContext, useContext, useEffect, useState } from "react";
import { expireSession, sessionPolicyExpired, subscribeToAuthChanges } from "../firebase/auth";

const AuthContext = createContext({ user: null, isLoading: true, sessionExpired: false });
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

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((nextUser) => {
      if (nextUser) {
        if (sessionPolicyExpired()) {
          setSessionValue(SESSION_MARKER, "1");
          setSessionExpired(true);
          setUser(null);
          setIsLoading(false);
          void expireSession();
          return;
        }
        setSessionValue(SESSION_MARKER, "1");
        setSessionValue(INTENTIONAL_SIGNOUT_MARKER, null);
        setSessionExpired(false);
      } else {
        const intentionalAt = Number(sessionValue(INTENTIONAL_SIGNOUT_MARKER) || 0);
        const intentional = intentionalAt > 0 && Date.now() - intentionalAt < 15000;
        if (intentional) {
          setSessionValue(SESSION_MARKER, null);
          setSessionValue(INTENTIONAL_SIGNOUT_MARKER, null);
          setSessionExpired(false);
        } else {
          setSessionExpired(sessionValue(SESSION_MARKER) === "1");
        }
      }
      setUser(nextUser);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const timer = window.setInterval(() => {
      if (sessionPolicyExpired()) {
        setSessionExpired(true);
        void expireSession();
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, isLoading, sessionExpired }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
