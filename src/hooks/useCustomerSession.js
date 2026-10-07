import { useAuth } from "../context/AuthContext";
export function useCustomerSession() {
  const principal = useAuth();
  // No trusted durable Account source exists; do not turn a provider UID or
  // cached Profile into permission to fetch private business state.
  return { ...principal, principal: principal.user, principalKind: principal.user ? "provider" : "guest", customerPrincipal: null,
    user: null, accountState: principal.user ? "source-unavailable" : principal.sessionState };
}
