import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import LoadingSpinner from "../common/LoadingSpinner";
import CustomerAccountBoundary from "./CustomerAccountBoundary";

export default function RequireAuth({ children }) {
  const { user, isLoading, sessionExpired, sessionState } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="container section"><LoadingSpinner label="Checking account access" /></div>;
  if (["unverifiable", "revoked"].includes(sessionState)) return <CustomerAccountBoundary />;
  if (!user) return <Navigate to="/signin" replace state={{ returnTo: `${location.pathname}${location.search}${location.hash}`, sessionExpired }} />;
  return children;
}
