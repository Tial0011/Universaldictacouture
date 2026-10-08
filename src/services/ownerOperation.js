import { runtimeErrorState } from "./operationalRuntime.js";

// Presentation/correlation only. Never an identity or authorization engine.
export function createPrincipalFence(principal, scope = () => "") {
  let generation = 0, active = true;
  return {
    begin: () => Object.freeze({ uid: principal(), scope: scope(), generation }),
    current: ticket => Boolean(active && ticket?.uid && ticket.uid === principal() && ticket.scope === scope() && ticket.generation === generation),
    invalidate: () => { generation++; },
    activate: () => { active = true; },
    dispose: () => { active = false; generation++; },
  };
}
export function ownerErrorState(error) {
  if(["invalid-argument","invalid-media"].includes(error?.code))return "validation";
  if(["payment-ineligible","payment-not-enabled","review-ineligible","publication-ineligible","approval-required"].includes(error?.code))return "stale";
  if(["operation-storage-unavailable","receipt-file-unavailable"].includes(error?.code))return "failed";
  return runtimeErrorState(error);
}
export function ownerErrorCopy(error, subject = "This action") {
  const state = ownerErrorState(error);
  if(error?.code==="operation-storage-unavailable")return "We could not keep the information needed to confirm this action. It was not started.";
  if(state==="validation")return "These details were not accepted. Check the required fields before continuing.";
  if(error?.code==="receipt-file-unavailable")return "The selected receipt could not be read. Choose the file again; it has not been submitted.";
  if (state === "unknown-result") return `${subject} is not confirmed yet. Check its outcome before trying again.`;
  if (state === "restricted") return "Your current access could not be confirmed. Private information and actions are unavailable.";
  if (state === "stale") return "This information changed elsewhere. Review the latest state before continuing.";
  if (state === "connection-problem") return "The connection is unavailable. Check current information when connected.";
  return `${subject} could not be checked. This does not confirm a missing record or a failed earlier action.`;
}
const optionalStorage = () => { try { return globalThis.sessionStorage; } catch { return null; } };
export function readOperationMarker(key, storage = optionalStorage()) {
  try {
    const text = storage?.getItem(key); if (!text) return null;
    let value; try { value = JSON.parse(text); } catch { value = { operationId: text }; }
    if (typeof value === "string") value = { operationId: value };
    const fields = ["operationId", "phase", "paymentId", "assetId"];
    if (!value || typeof value !== "object" || Array.isArray(value) || !/^[A-Za-z0-9:_-]{1,180}$/.test(value.operationId) || Object.keys(value).some(field => !fields.includes(field))) return null;
    for (const field of ["phase", "paymentId", "assetId"]) if (value[field] != null && !/^[A-Za-z0-9:_-]{1,180}$/.test(value[field])) return null;
    return value;
  } catch { return null; }
}
export function writeOperationMarker(key, value, storage = optionalStorage()) {
  const probe = { getItem: () => JSON.stringify(value) };
  if (!readOperationMarker(key, probe)) throw Object.assign(Error("Confirmation handle unavailable."), { code: "operation-storage-unavailable" });
  try { storage.setItem(key, JSON.stringify(value)); }
  catch { throw Object.assign(Error("Confirmation handle unavailable. No action was started."), { code: "operation-storage-unavailable" }); }
}
export function clearOperationMarker(key, storage = optionalStorage()) { try { storage?.removeItem(key); } catch { /* retain opaque correlation; never private content */ } }
