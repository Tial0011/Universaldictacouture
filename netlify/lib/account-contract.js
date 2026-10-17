import { createHash, createHmac } from "node:crypto";
export const LIFECYCLES = Object.freeze(["ACTIVE", "RESTRICTED", "DELETED-CUSTOMER REQUESTED", "DELETED-ADMIN ACTION", "RESTORED"]);
export const RESOLUTIONS = Object.freeze(["RESTORE ORIGINAL ACCOUNT", "ALLOW NEW ACCOUNT AFTER REVIEW", "RESTRICT REGISTRATION", "RARE MERGE"]);
export class AccountError extends Error {
  constructor(code, status = 403) { super(code); this.code = code; this.status = status; }
}
export function fail(code = "permission-denied", status = 403) { throw new AccountError(code, status); }
export function identifier(value) { if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{1,180}$/.test(value)) fail("invalid-argument", 400); return value; }
export function exactFields(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) fail("invalid-argument", 400);
  return value;
}
export function digest(value) { return createHash("sha256").update(value).digest("hex"); }
export function emailKey(email, secret) {
  if (typeof email !== "string" || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !secret || secret.length < 32) fail("invalid-argument", 400);
  // A protected login-conflict lookup key, NEVER durable business identity.
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
}
export function activeAccount(account, claims, binding, { allowBlocked = false, freshSeconds = null, now = Date.now() } = {}) {
  if (!account || !binding || binding.uid !== claims.uid || binding.accountId !== account.accountId
    || account.principalUid !== claims.uid || binding.epoch !== account.epoch || account.canonicalAccountId) fail();
  if (!LIFECYCLES.includes(account.lifecycle)) fail();
  if (Object.keys(binding).some(key => !["uid", "accountId", "active", "epoch"].includes(key))) fail("account-binding-ambiguous");
  if (binding.active !== true && !(allowBlocked && account.lifecycle.startsWith("DELETED-"))) fail(account.lifecycle.startsWith("DELETED-") ? "account-deleted" : "permission-denied");
  if (!allowBlocked && !["ACTIVE", "RESTORED"].includes(account.lifecycle)) fail(account.lifecycle === "RESTRICTED" ? "account-restricted" : "account-deleted");
  if (!allowBlocked && account.proofEffects?.reset) fail("security-outcome-unknown", 409);
  if (!Number.isInteger(claims.auth_time) || claims.auth_time <= (account.validAfter || 0)) fail("session-revoked", 401);
  if (freshSeconds != null && (claims.auth_time > Math.floor(now / 1000) + 30 || now / 1000 - claims.auth_time > freshSeconds)) fail("fresh-auth-required", 401);
  return account;
}
export function profileFields(value, { mutation = true } = {}) {
  exactFields(value, ["fullName", "preferredName", "phoneNumber", "publicDisplayName", "profilePhoto"]);
  for (const [key, text] of Object.entries(value)) {
    if (key === "profilePhoto") { if (text !== null && (mutation || typeof text !== "string")) fail("private-media-owner-required", 409); continue; }
    if (typeof text !== "string" || text.length > 1000 || (mutation && ["fullName", "phoneNumber"].includes(key) && !text.trim())) fail("invalid-argument", 400);
  }
  return Object.fromEntries(Object.entries(value).map(([key, text]) => [key, typeof text === "string" ? text.trim() : text]));
}
export function addressFields(value) {
  exactFields(value, ["label", "recipientName", "recipientPhone", "fullAddress", "deliveryNote"]);
  for (const key of ["label", "recipientName", "recipientPhone", "fullAddress"]) if (typeof value[key] !== "string" || !value[key].trim()) fail("invalid-argument", 400);
  for (const text of Object.values(value)) if (typeof text !== "string" || text.length > 4000) fail("invalid-argument", 400);
  return Object.fromEntries(Object.entries(value).map(([key, text]) => [key, text.trim()]));
}
export function preferenceFields(value) {
  exactFields(value, ["preset", "couturierAlerts", "styleCircle", "quietHours", "styleDigest"]);
  if (value.preset !== undefined && !["Important Only", "Balanced", "All Updates"].includes(value.preset)) fail("invalid-argument", 400);
  for (const key of ["couturierAlerts", "styleCircle"]) if (value[key] !== undefined && typeof value[key] !== "boolean") fail("invalid-argument", 400);
  if (value.styleDigest !== undefined && !["Instant", "Weekly"].includes(value.styleDigest)) fail("invalid-argument", 400);
  if (value.quietHours !== undefined) {
    exactFields(value.quietHours, ["enabled", "from", "to", "timeZone"]);
    if (typeof value.quietHours.enabled !== "boolean" || typeof value.quietHours.timeZone !== "string" || !value.quietHours.timeZone || value.quietHours.timeZone.length > 100 || !/^\d{2}:\d{2}$/.test(value.quietHours.from || "") || !/^\d{2}:\d{2}$/.test(value.quietHours.to || "")) fail("invalid-argument", 400);
    try { new Intl.DateTimeFormat("en", { timeZone: value.quietHours.timeZone }); } catch { fail("invalid-argument", 400); }
    for (const time of [value.quietHours.from, value.quietHours.to]) if (+time.slice(0, 2) > 23 || +time.slice(3) > 59) fail("invalid-argument", 400);
  }
  return value;
}
export function customerProjection(account) {
  return { accountId: account.accountId, principalUid: account.principalUid, lifecycle: account.lifecycle, epoch: account.epoch,
    version: account.version, emailVerification: account.emailControlConfirmed === true ? "confirmed" : "pending", authorized: ["ACTIVE", "RESTORED"].includes(account.lifecycle) && !account.proofEffects?.reset, restricted: account.lifecycle === "RESTRICTED" };
}
export function requireFresh(claims, seconds, now) {
  if (!Number.isInteger(claims.auth_time) || claims.auth_time > now / 1000 + 30 || now / 1000 - claims.auth_time > seconds) fail("fresh-auth-required", 401);
}
