export const OPERATIONAL_STATES = Object.freeze(["normal", "loading", "partial-loading", "empty", "success", "error", "retryable-error", "retry", "connection-problem", "source-unavailable", "partial-source-failure", "restricted", "permission-denied", "stale", "resolved", "resolved-elsewhere", "dormant", "no-results", "checking-result", "unknown-result", "archived", "closed", "temporarily-unavailable"]);
export function runtimeErrorState(error) {
  const code = String(error?.code || "").replace(/^firestore\//, "");
  if (["permission-denied", "unauthenticated"].includes(code)) return "restricted";
  if (["unavailable", "deadline-exceeded", "network-request-failed"].includes(code)) return "connection-problem";
  if (code === "outcome-unknown") return "unknown-result";
  if (code === "aborted") return "stale";
  return "source-unavailable";
}
export function runtimeStateMessage(state) {
  return ({ normal: "Current operational context.", success: "The current source result has been confirmed.", resolved: "Current owner state is resolved.", dormant: "Current owner context is dormant. Historical access remains independently protected.", archived: "Current owner context is archived.", closed: "Current owner context is closed.", error: "This request could not be completed. No protected success is inferred.", "retryable-error": "This read could not be completed. Retry when the source is available.", retry: "Checking current context again.", "partial-loading": "Some current sources are still loading; checked independent context remains usable.", "partial-source-failure": "Some current sources are unavailable. This is a partial view, not a true zero.", "temporarily-unavailable": "This source is temporarily unavailable.", loading: "Checking current owner context…", "initial-loading": "Checking current owner context…", restricted: "Current access does not permit this context. No additional record details are disclosed.", "permission-denied": "Current access does not permit this context.", "connection-problem": "Connection problem. Current owner context could not be checked. Retry this read when connected.", "source-unavailable": "Owner source unavailable. This does not establish that the record is missing.", unavailable: "No currently accessible owner context could be established.", empty: "The checked source confirms no eligible records in this page.", "no-results": "No matching results in the checked authorized context.", stale: "Changed elsewhere. Check current owner state before continuing.", "resolved-elsewhere": "Resolved elsewhere. No duplicate action was performed.", "unknown-result": "Outcome unknown. Check authoritative state before any retry.", "checking-result": "Checking the authoritative result…" })[state] || "Current context could not be verified.";
}
function deadline(operation, timeoutMs, code, message) {
  // This only bounds UI waiting, never cancels an in-flight owner operation.
  // A late commit remains possible and must reconcile by its existing handle.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(message), { code })), timeoutMs);
    Promise.resolve(operation).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
export function protectedWriteDeadline(operation, timeoutMs = 15000) {
  return deadline(operation, timeoutMs, "outcome-unknown", "Outcome unknown. Check current owner state before retrying.");
}
export function currentReadDeadline(operation, timeoutMs = 15000) {
  return deadline(operation, timeoutMs, "deadline-exceeded", "Current source read could not be completed.");
}
export function ownsCommittedReceipt(receipt, staff, operationId, pending) {
  return Boolean(pending?.operationId === operationId && receipt?.outcome === "committed" && receipt.execution === "staff"
    && receipt.actorUid === staff.principalUid && receipt.actorStaffId === staff.staffId
    && ["save", "unpublish", "archive", "restore"].includes(receipt.action));
}
