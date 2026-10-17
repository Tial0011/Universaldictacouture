import { randomBytes } from "node:crypto";
import { exactFields, fail, requireFresh } from "./account-contract.js";
import { resolveStaffIdentity } from './staff-authority.js';

export function createAccountSessions(service, { origin }) {
  const { db, ref, keyed, customer, now } = service;
  const secure = new URL(origin).protocol === "https:";
  const name = kind => (secure ? "__Host-" : "") + "udc_" + kind + "_session";
  function cookie(request, kind) {
    const value = request.headers.get("cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(name(kind) + "="))?.slice(name(kind).length + 1);
    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }
  const header = (kind, value, age) => `${name(kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? "; Secure" : ""}`;
  async function start(request, claims, input) {
    exactFields(input, ["kind", "keepSignedIn", "label"]);
    const kind = input.kind;
    if (!["customer", "staff"].includes(kind) || typeof input.keepSignedIn !== "boolean" || typeof input.label !== "string" || input.label.length > 80) fail("invalid-argument", 400);
    requireFresh(claims, 300, now());
    const token = randomBytes(32).toString("base64url"), sessionId = keyed(token), existingCookie = cookie(request, kind);
    const maxAge = input.keepSignedIn ? 30 * 86400 : 86400;
    const established = await db.runTransaction(async tx => {
      let identity;
      if (kind === "customer") { const account = await customer(tx, claims); identity = { accountId: account.accountId, epoch: account.epoch }; }
      else {
        const staff = await resolveStaffIdentity(tx, db, claims, now());
        identity = { staffId: staff.staffId };
      }
      const admission = (await tx.get(ref(`accountSessionAdmission/${keyed(kind + ":" + claims.uid)}`))).data();
      const old = existingCookie ? (await tx.get(ref(`accountSessions/${keyed(existingCookie)}`))).data() : null;
      if (old?.active && old.uid === claims.uid && old.kind === kind && old.expiresAt > now() && old.authTime === claims.auth_time
        && (kind === "staff" ? old.staffId === identity.staffId : old.accountId === identity.accountId && old.epoch === identity.epoch)) return { token: existingCookie, expiresAt: old.expiresAt };
      if (claims.auth_time <= (admission?.closedThrough || 0)) fail("fresh-auth-required", 401);
      if (old?.active && old.uid === claims.uid && old.kind === kind) {
        tx.update(ref(`accountSessions/${keyed(existingCookie)}`), { active: false, revokedAt: now() });
        tx.set(ref(`sessionAccess/${keyed(existingCookie)}`), { uid: claims.uid, kind, active: false });
        tx.set(ref(`accountSessionAdmission/${keyed(kind + ":" + claims.uid)}`), { closedThrough: Math.max(admission?.closedThrough || 0, old.authTime) });
      }
      tx.create(ref(`accountSessions/${sessionId}`), { uid: claims.uid, kind, ...identity, authTime: claims.auth_time, active: true, label: input.label, createdAt: now(), expiresAt: now() + maxAge * 1000 });
      tx.set(ref(`sessionAccess/${sessionId}`), { uid: claims.uid, kind, active: true });
      return { token, expiresAt: now() + maxAge * 1000 };
    });
    return { value: { state: "established", sessionRef: keyed(established.token), expiresAt: established.expiresAt }, cookie: header(kind, established.token, Math.max(1, Math.floor((established.expiresAt - now()) / 1000))) };
  }
  async function validate(request, claims, kind) {
    const token = cookie(request, kind); if (!token) fail("session-required", 401);
    const id = keyed(token), session = (await ref(`accountSessions/${id}`).get()).data();
    if (!session || !session.active || session.uid !== claims.uid || session.kind !== kind || session.expiresAt <= now() || session.authTime !== claims.auth_time) fail("session-required", 401);
    return { ...claims, _session: { id, kind } };
  }
  async function end(request, claims, input) {
    exactFields(input, ["kind"]); if (!["customer", "staff"].includes(input.kind)) fail("invalid-argument", 400);
    const token = cookie(request, input.kind);
    if (token) await db.runTransaction(async tx => {
      const sessionRef = ref(`accountSessions/${keyed(token)}`), session = (await tx.get(sessionRef)).data();
      const admissionRef = ref(`accountSessionAdmission/${keyed(input.kind + ":" + claims.uid)}`), admission = (await tx.get(admissionRef)).data();
      if (!session || session.uid !== claims.uid || session.kind !== input.kind) fail();
      tx.update(sessionRef, { active: false, revokedAt: now() });
      tx.set(ref(`sessionAccess/${keyed(token)}`), { uid: claims.uid, kind: input.kind, active: false });
      // Close replacement admission for the old proof, not other already-valid
      // sessions. A copied old token cannot mint a new cookie after Sign Out.
      tx.set(admissionRef, { closedThrough: Math.max(admission?.closedThrough || 0, session.authTime) });
    });
    return { value: { state: "ended" }, cookie: header(input.kind, "", 0) };
  }
  return { start, validate, end };
}
