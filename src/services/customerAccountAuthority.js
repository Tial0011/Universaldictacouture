// Section 16 Flow 1 requires a trusted durable-Account binding. The current
// repository has no such source. Provider UID/email must not be its substitute.
// This explicit closed integration boundary creates no collection or endpoint.
export function requireCustomerAccountAuthority() {
  throw Object.assign(new Error("Current UDC Account source is unavailable."), { code: "account-source-unavailable" });
}
export function classifyAccountContext(context, principalUid) {
  // Classification of trusted owner output only, never authorization of
  // arbitrary client context. A missing principal cannot match another null.
  if (typeof principalUid !== "string" || !principalUid.trim() || !context || context.principalUid !== principalUid || typeof context.accountId !== "string" || !context.accountId.trim()) return "unavailable";
  if (["DELETED-CUSTOMER REQUESTED", "DELETED-ADMIN ACTION"].includes(context.lifecycle)) return "deleted";
  if (context.lifecycle === "RESTRICTED" || context.restricted === true) return "restricted";
  if (["ACTIVE", "RESTORED"].includes(context.lifecycle) && context.authorized === true && context.restricted === false) return "authorized";
  return "unavailable";
}
