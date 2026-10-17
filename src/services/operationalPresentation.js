// Presentation only: never determines authority, recovery destinations or retries.
export function operationalPresentation(state) {
  if (["loading", "initial-loading", "partial-loading", "checking", "checking-result", "retry"].includes(state)) return { icon: "loader", tone: "checking", title: "Checking current context" };
  if (["restricted", "permission-denied", "inactive", "blocked"].includes(state)) return { icon: "lock", tone: "restricted", title: state === "inactive" ? "Staff access inactive" : "Current access restricted" };
  if (["connection-problem", "source-unavailable", "temporarily-unavailable", "partial-source-failure", "error", "retryable-error", "unavailable"].includes(state)) return { icon: "alert-triangle", tone: "unavailable", title: state === "connection-problem" ? "Connection problem" : "Current context unable to verify" };
  if (["unknown-result", "unresolved"].includes(state)) return { icon: "info", tone: "unresolved", title: state === "unresolved" ? "Account context unresolved" : "Result unresolved" };
  if (["resolved", "resolved-elsewhere", "success"].includes(state)) return { icon: "check-circle", tone: "resolved", title: state === "resolved-elsewhere" ? "Resolved elsewhere" : "Current result confirmed" };
  if (state === "stale") return { icon: "info", tone: "stale", title: "Context changed" };
  return { icon: "info", tone: "neutral", title: ["empty", "no-results"].includes(state) ? "No matching current work" : "Operational context" };
}
