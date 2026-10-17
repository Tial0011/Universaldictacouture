import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import LoadingSpinner from "../common/LoadingSpinner";

export default function RequireAuth({ children }) {
  const { user, isLoading, sessionExpired } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="container section"><LoadingSpinner label="Checking account access" /></div>;
  if (!user) return <Navigate to="/signin" replace state={{ returnTo: `${location.pathname}${location.search}${location.hash}`, sessionExpired }} />;
  return children;
}
