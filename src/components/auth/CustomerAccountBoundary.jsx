import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AccountAccessState } from "../account/AccountVisuals";
import { safeReturnPath } from "../../services/authFlow";
import "../../pages/Profile/Profile.css";

export default function CustomerAccountBoundary() {
  const { user, isLoading, sessionState, recheckSession } = useAuth();
  const location = useLocation();
  if (isLoading) return <AccountAccessState state="checking" />;
  if (!user && !["unverifiable", "revoked"].includes(sessionState)) return <Navigate to="/signin" replace state={{ returnTo: safeReturnPath(location.pathname + location.search), sessionReason: sessionState }} />;
  return <AccountAccessState state={sessionState === "revoked" ? "revoked" : "unavailable"} onCheck={recheckSession} />;
  // No positive Account source is present. Do not mount protected children.
}
export function CustomerOrGuest({ children }) {
  const { user, isLoading, sessionState } = useAuth();
  return user || isLoading || ["unverifiable", "revoked"].includes(sessionState) ? <CustomerAccountBoundary /> : children;
}
