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
function unsafeCharacters(value, includeSpace = false) {
  return [...value].some(character => character === "\\" || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || (includeSpace && character === " "));
}

export function safeReturnPath(value, fallback = "/profile") {
  fallback = SAFE_PREFIXES.includes(fallback) ? fallback : "/profile";
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || unsafeCharacters(value, true)) return fallback;
  let url;
  try {
    let decoded = value;
    for (let round = 0; round < 3; round++) { decoded = decodeURIComponent(decoded); if (unsafeCharacters(decoded) || decoded.startsWith("//") || decoded.split(/[?#]/)[0].split("/").some(segment => segment === "." || segment === "..")) return fallback; }
    url = new URL(value, "https://udc.local");
  } catch {
    return fallback;
  }
  const allowed = url.origin === "https://udc.local" && SAFE_PREFIXES.some((prefix) => prefix === "/" ? url.pathname === "/" : url.pathname === prefix || url.pathname.startsWith(prefix + "/"));
  for (const key of [...url.searchParams.keys()]) if (/token|password|email|phone|address|oobcode|secret|credential|returnto|redirect/i.test(key)) url.searchParams.delete(key);
  if (url.hash && !/^#[a-z0-9_-]{1,64}$/i.test(url.hash)) url.hash = "";
  return allowed ? `${url.pathname}${url.search}${url.hash}` : fallback;
}

// Section 16 Module 1 Flow 4 current written policy, not old visual copy.
export function passwordPolicyError(password) {
  return typeof password === "string" && [...password].length >= 15 && [...password].length <= 64 ? "" : "Use a password of 15–64 characters. Paste and password managers are supported.";
}

export function authFailureMessage(error) {
  if (error?.code === "auth/invalid-email") return "Enter a valid email address.";
  if (error?.code === "account-source-unavailable") return "Current UDC Account authority is unavailable. Authentication alone does not grant private access.";
  if (["auth/network-request-failed", "auth/outcome-unknown", "outcome-unknown", "deadline-exceeded"].includes(error?.code)) return "The outcome could not be confirmed. Check the current session or result before repeating this request.";
  if (error?.code === "auth/expired-action-code") return "This secure link has expired. Request a current link.";
  if (error?.code === "auth/invalid-action-code") return "This link is invalid, consumed or superseded. Its precise state could not be established.";
  if (error?.code === "auth/wrong-purpose") return "This link cannot be used for this operation.";
  if (error?.code === "auth/wrong-account") return "This proof does not match the current account context. No change was made.";
  if (["auth/too-many-requests", "auth/quota-exceeded"].includes(error?.code)) return "This request cannot be completed right now. Please wait before continuing.";
  return "We could not complete this request with the supplied details.";
}

const continuations = new Map();
export function createAuthContinuation(returnTo, actor = "guest") {
  const id = globalThis.crypto.randomUUID();
  continuations.set(id, { returnTo: safeReturnPath(returnTo), actor });
  // Context is navigation only. Private drafts/proofs/commands never enter history.
  return { authContinuation: id, returnTo: safeReturnPath(returnTo) };
}
export function continuationTarget(state, actor) {
  const stored = continuations.get(state?.authContinuation);
  return stored && (stored.actor === "guest" || stored.actor === actor) ? stored.returnTo : typeof state?.returnTo === "string" ? safeReturnPath(state.returnTo) : "";
}
export function clearAuthContinuations() { continuations.clear(); }
export function safeNavigationState(state) {
  if (!state || typeof state !== "object") return null;
  const result = {};
  if (typeof state.returnTo === "string") result.returnTo = safeReturnPath(state.returnTo);
  if (typeof state.authContinuation === "string" && state.authContinuation.length <= 100) result.authContinuation = state.authContinuation;
  if (["expired", "signed-out", "session-ended"].includes(state.sessionReason)) result.sessionReason = state.sessionReason;
  if (state.verifyAfterSignIn === true) result.verifyAfterSignIn = true;
  return Object.keys(result).length ? result : null;
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
