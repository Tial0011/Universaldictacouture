const SAFE_PREFIXES = [
  "/",
  "/shop",
  "/custom-style",
  "/reviews-feeds",
  "/chats",
  "/profile",
  "/my-closet",
  "/about",
  "/our-story",
  "/policies",
];

export const AUTH_PREFERENCE_KEY = "udc:auth:keep-signed-in";

export function safeReturnPath(value, fallback = "/profile") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  let url;
  try {
    url = new URL(value, "https://udc.local");
  } catch {
    return fallback;
  }
  const allowed = SAFE_PREFIXES.some((prefix) => prefix === "/" ? url.pathname === "/" : url.pathname === prefix || url.pathname.startsWith(prefix + "/"));
  return allowed ? `${url.pathname}${url.search}${url.hash}` : fallback;
}

export function currentInternalPath(location) {
  if (!location) return "/";
  return safeReturnPath(`${location.pathname || "/"}${location.search || ""}${location.hash || ""}`, "/");
}

export function maskEmail(value) {
  const email = String(value || "").trim();
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(3, Math.min(8, name.length - visible.length)))}@${domain}`;
}

export function readKeepSignedInPreference() {
  try {
    return sessionStorage.getItem(AUTH_PREFERENCE_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberKeepSignedInPreference(value) {
  try {
    if (value) sessionStorage.setItem(AUTH_PREFERENCE_KEY, "1");
    else sessionStorage.removeItem(AUTH_PREFERENCE_KEY);
  } catch {
    // Optional preference only.
  }
}

export function clearKeepSignedInPreference() {
  try { sessionStorage.removeItem(AUTH_PREFERENCE_KEY); } catch { /* optional */ }
}
