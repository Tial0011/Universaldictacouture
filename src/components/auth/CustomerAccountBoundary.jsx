import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Button from "../common/Button";
import { safeReturnPath } from "../../services/authFlow";
import "../../pages/Profile/Profile.css";

export default function CustomerAccountBoundary() {
  const { user, isLoading, sessionState, recheckSession } = useAuth();
  const location = useLocation();
  if (isLoading) return <section className="container section" role="status"><h1>Checking your account</h1><p>Private content is unavailable while current authority is checked.</p></section>;
  if (!user && !["unverifiable", "revoked"].includes(sessionState)) return <Navigate to="/signin" replace state={{ returnTo: safeReturnPath(location.pathname + location.search), sessionReason: sessionState }} />;
  return <section className="container section account-page"><div className="account-card account-card--status"><h1>{sessionState === "revoked" ? "Session revoked" : "Account authority unavailable"}</h1><p role="status">{sessionState === "revoked" ? "Current provider session authority has ended. No private content is shown." : "Current durable UDC Account binding and lifecycle could not be established. This is not proof of deletion, restriction or an empty account."}</p><p>Authentication alone does not authorize this private destination. The trusted Section 16 Account source must be integrated before protected customer work opens.</p><div className="account-actions"><Button onClick={recheckSession}>Check current session</Button><Button to="/" variant="secondary">Return Home</Button><Button to="/signin" variant="ghost">Account entry</Button></div></div></section>;
  // No positive Account source is present. Do not mount protected children.
}
export function CustomerOrGuest({ children }) {
  const { user, isLoading, sessionState } = useAuth();
  return user || isLoading || ["unverifiable", "revoked"].includes(sessionState) ? <CustomerAccountBoundary /> : children;
}
