// Section 15 semantic vocabulary; existing owner-state names remain compatible.
export const SECTION15_STATES = Object.freeze(["NORMAL","LOADING","EMPTY","SUCCESS","PARTIAL","ERROR","RETRYABLE ERROR","OFFLINE","SOURCE UNAVAILABLE","RESTRICTED","PERMISSION LOST","STALE","SUPERSEDED","RESOLVED ELSEWHERE","UNKNOWN OUTCOME","CHECKING RESULT","CONFLICT","PROCESSING","PROPAGATION PENDING","HISTORY ONLY","TEMPORARILY UNAVAILABLE"]);
export const SECTION15_STATE_ALIASES = Object.freeze({ checking: 'LOADING', unavailable: 'SOURCE UNAVAILABLE', 'initial-loading': 'LOADING', 'unknown-result': 'UNKNOWN OUTCOME', 'checking-result': 'CHECKING RESULT', 'connection-problem': 'OFFLINE', 'partial-source-failure': 'PARTIAL', 'partial-loading': 'PARTIAL', 'permission-denied': 'RESTRICTED', 'permission-lost': 'PERMISSION LOST' });
export function semanticState(state) { return SECTION15_STATE_ALIASES[state] || String(state).replaceAll('-', ' ').toUpperCase(); }
export const OPERATIONAL_STATES = Object.freeze(["normal", "loading", "partial-loading", "empty", "success", "error", "retryable-error", "retry", "connection-problem", "source-unavailable", "partial-source-failure", "restricted", "permission-denied", "stale", "resolved", "resolved-elsewhere", "dormant", "no-results", "checking-result", "unknown-result", "archived", "closed", "temporarily-unavailable", "offline", "partial", "permission-lost", "superseded", "unknown-outcome", "conflict", "processing", "propagation-pending", "history-only"]);
export function runtimeErrorState(error) {
  const code = String(error?.code || "").replace(/^firestore\//, "");
  if (["staff-inactive", "staff-binding-ambiguous", "staff-migration-required"].includes(code)) return "restricted";
  if (["permission-denied", "unauthenticated", "session-required", "session-revoked", "fresh-auth-required", "account-restricted", "account-deleted", "stale-authority", "auth/principal-changed"].includes(code)) return "restricted";
  if (["unavailable", "deadline-exceeded", "network-request-failed"].includes(code)) return "connection-problem";
  if (["outcome-unknown", "auth/outcome-unknown", "security-outcome-unknown"].includes(code)) return "unknown-result";
  if (["aborted", "stale-conflict", "operation-conflict", "product-state-changed", "address-state-changed"].includes(code)) return "stale";
  return "source-unavailable";
}
export function runtimeStateMessage(state) {
  return ({ partial: "Some independent sources are available; unavailable sources are identified separately.", offline: "Offline. Current information cannot be checked.", 'permission-lost': "Current permission has been lost. Protected information and actions are unavailable.", superseded: "A newer version is current. This version is retained as history.", 'unknown-outcome': "Outcome unknown. Check authoritative state before any retry.", conflict: "The expected version changed. Reload and review before another action.", processing: "The accepted operation is still processing.", 'propagation-pending': "The canonical change is confirmed. Supporting views are still updating.", 'history-only': "Historical evidence only. Current access and action rules still apply.", normal: "Current operational context.", success: "The current source result has been confirmed.", resolved: "Current owner state is resolved.", dormant: "Current owner context is dormant. Historical access remains independently protected.", archived: "Current owner context is archived.", closed: "Current owner context is closed.", error: "This request could not be completed. No protected success is inferred.", "retryable-error": "This read could not be completed. Retry when the source is available.", retry: "Checking current context again.", "partial-loading": "Some current sources are still loading; checked independent context remains usable.", "partial-source-failure": "Some current sources are unavailable. This is a partial view, not a true zero.", "temporarily-unavailable": "This source is temporarily unavailable.", loading: "Checking current owner context…", "initial-loading": "Checking current owner context…", restricted: "Current access does not permit this context. No additional record details are disclosed.", "permission-denied": "Current access does not permit this context.", "connection-problem": "Connection problem. Current owner context could not be checked. Retry this read when connected.", "source-unavailable": "Owner source unavailable. This does not establish that the record is missing.", unavailable: "No currently accessible owner context could be established.", empty: "The checked source confirms no eligible records in this page.", "no-results": "No matching results in the checked authorized context.", stale: "Changed elsewhere. Check current owner state before continuing.", "resolved-elsewhere": "Resolved elsewhere. No duplicate action was performed.", "unknown-result": "Outcome unknown. Check authoritative state before any retry.", "checking-result": "Checking the authoritative result…" })[state] || "Current context could not be verified.";
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
