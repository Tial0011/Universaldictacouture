import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AccountAccessState } from "../account/AccountVisuals";
import { safeReturnPath } from "../../services/authFlow";
import "../../pages/Profile/Profile.css";
import { useCustomerSession } from "../../hooks/useCustomerSession";

export default function CustomerAccountBoundary({ children }) {
  const { user, isLoading, sessionState, recheckSession } = useAuth();
  const resolved = useCustomerSession();
  const location = useLocation();
  if (isLoading) return <AccountAccessState state="checking" />;
  if (!user && !["unverifiable", "revoked"].includes(sessionState)) return <Navigate to="/signin" replace state={{ returnTo: safeReturnPath(location.pathname + location.search), sessionReason: sessionState }} />;
  if (resolved.user) return children;
  return <AccountAccessState state={sessionState === "revoked" ? "revoked" : resolved.accountState} onCheck={user ? resolved.recheckCustomer : recheckSession} />;
}
export function CustomerOrGuest({ children }) {
  const { user, isLoading, sessionState } = useAuth();
  return user || isLoading || ["unverifiable", "revoked"].includes(sessionState) ? <CustomerAccountBoundary>{children}</CustomerAccountBoundary> : children;
}
