import { normalizeStaffMembership, authorizationRoutes } from "../../src/services/staffAuthorization.js";
import { fail } from "./account-contract.js";

// The target/purpose/action policy is supplied by trusted owner code, never copied
// from a browser-supplied authorization capsule. Each route stands alone.
export function completeStaffRoute(staff, requirement, claims, now = Date.now()) {
  if (!staff || staff.sharedAccount === true || staff.active !== true || staff.principalUids?.length > 1 || !claims || !Number.isInteger(claims.auth_time)) return false;
  if (claims.auth_time <= (staff.validAfter || 0)) return false;
  if (requirement.freshSeconds != null && (now / 1000 - claims.auth_time > requirement.freshSeconds || claims.auth_time > now / 1000 + 30)) return false;
  if (requirement.couturier && (staff.functionAsCouturier !== true || staff.eligible !== true)) return false;
  if (requirement.newWork && staff.available !== true) return false;
  return authorizationRoutes(staff, requirement.capability, requirement.purpose).some(route => {
    if (route.actions && (!Array.isArray(route.actions) || !route.actions.includes(requirement.action))) return false;
    if (route.states && (!Array.isArray(route.states) || !route.states.includes(requirement.state))) return false;
    // A sensitive field component always requires a complete data/purpose route.
    if (requirement.dataClass && route.family !== "dataPurpose") return false;
    if (route.family === "domainWide") return !requirement.governanceArea;
    if (route.family === "selectedObject") return !requirement.governanceArea && route.ids?.includes(requirement.objectId);
    if (route.family === "assignmentDerived") return !requirement.governanceArea && staff.functionAsCouturier === true && staff.eligible === true && requirement.assignedStaffId === staff.staffId;
    if (route.family === "queueSubset") return !requirement.governanceArea && requirement.queueEligible === true && route.queueIds?.includes(requirement.queueId);
    if (route.family === "dataPurpose") return route.ids?.includes(requirement.objectId) && route.dataClasses?.includes(requirement.dataClass);
    if (route.family === "governance") return route.area === requirement.governanceArea && route.ids?.includes(requirement.objectId);
    return false;
  });
}
export async function resolveStaffIdentity(transaction, db, claims, now) {
  const raw = (await transaction.get(db.doc(`admins/${claims.uid}`))).data();
  const security = (await transaction.get(db.doc(`principalSecurity/${claims.uid}`))).data();
  if (security && claims.auth_time <= security.validAfter) fail("session-revoked", 401);
  const staff = normalizeStaffMembership(claims.uid, raw);
  if (!staff || staff.active !== true || staff.sharedAccount === true || !Number.isInteger(claims.auth_time) || claims.auth_time <= (staff.validAfter || 0)) fail();
  if (claims._session) {
    const session = (await transaction.get(db.doc(`accountSessions/${claims._session.id}`))).data();
    if (!session || session.kind !== "staff" || session.uid !== claims.uid || session.staffId !== staff.staffId || !session.active || session.expiresAt <= (typeof now === "function" ? now() : now || Date.now())) fail("session-required", 401);
  }
  // Preserve the explicit development bridge for its existing capabilities only.
  // It has no identity-governance grants and cannot mint durable Staff records.
  if (!staff.compatibilityMode) {
    const identity = (await transaction.get(db.doc(`staffIdentities/${staff.staffId}`))).data();
    if (!identity) fail("staff-migration-required");
    if (identity.active !== true) fail("staff-inactive");
    if (identity.principalUid !== claims.uid || identity.staffId !== staff.staffId || identity.principalUids?.length > 1) fail("staff-binding-ambiguous");
  }
  return { ...staff, principalUid: claims.uid };
}
export async function resolveStaff(transaction, db, claims, requirement, now) {
  const staff = await resolveStaffIdentity(transaction, db, claims, now);
  if (!completeStaffRoute(staff, requirement, claims, now)) fail();
  return staff;
}
