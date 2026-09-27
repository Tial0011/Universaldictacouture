import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import AuthGateDialog from "../components/auth/AuthGateDialog";
import { currentInternalPath, safeReturnPath } from "../services/authFlow";

const AuthGateContext = createContext({ requestAuth: () => {}, closeAuthGate: () => {} });

export function AuthGateProvider({ children }) {
  const location = useLocation();
  const [gate, setGate] = useState(null);
  const requestAuth = useCallback((options = {}) => {
    setGate({
      returnTo: safeReturnPath(options.returnTo || currentInternalPath(location), "/"),
      returnState: options.returnState || null,
    });
  }, [location]);
  const closeAuthGate = useCallback(() => setGate(null), []);
  const value = useMemo(() => ({ requestAuth, closeAuthGate }), [requestAuth, closeAuthGate]);
  return <AuthGateContext.Provider value={value}>{children}<AuthGateDialog gate={gate} onClose={closeAuthGate} /></AuthGateContext.Provider>;
}

export function useAuthGate() { return useContext(AuthGateContext); }
