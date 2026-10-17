const prefix = "udc:staff-operation:";
export function staffOperationActor(principalUid, staffId) { return principalUid + "/" + staffId; }
function browserStorage() { try { return sessionStorage; } catch { return null; } }
function key(principalUid, kind) { return prefix + principalUid + ":" + kind; }
export function pendingStaffOperation(principalUid, kind, storage = browserStorage()) {
  if (!principalUid || !storage) return null;
  try {
    const value = JSON.parse(storage.getItem(key(principalUid, kind)) || "null");
    return value && typeof value.operationId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value.operationId) ? value : null;
  } catch { return null; }
}
export function beginStaffOperation(principalUid, kind, operationId, storage = browserStorage()) {
  if (!principalUid || !kind || typeof operationId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(operationId)) throw Object.assign(new Error("A valid operation handle is required before saving."), { code: "failed-precondition" });
  const pending = pendingStaffOperation(principalUid, kind, storage);
  if (pending && pending.operationId !== operationId) throw Object.assign(new Error("A previous operation needs authoritative reconciliation."), { code: "outcome-unknown" });
  if (!storage) throw Object.assign(new Error("This browser cannot retain an operation reference. Enable session storage before saving."), { code: "failed-precondition" });
  try { storage.setItem(key(principalUid, kind), JSON.stringify({ operationId })); }
  catch { throw Object.assign(new Error("This browser cannot retain an operation reference. No save has started."), { code: "failed-precondition" }); }
}
export function clearStaffOperation(principalUid, kind, operationId, storage = browserStorage()) {
  if (pendingStaffOperation(principalUid, kind, storage)?.operationId !== operationId) return;
  try { storage.removeItem(key(principalUid, kind)); } catch { /* Retaining the marker is safer than silently authorizing retry. */ }
}
