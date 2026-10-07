// Visual vocabulary only: elapsed time and UI state never establish owner truth.
export const ACCOUNT_NOTICE_STATES = Object.freeze({
  loading: { icon: "loader", title: "Checking current information", tone: "neutral" },
  unavailable: { icon: "info", title: "Temporarily unavailable", tone: "neutral" },
  pending: { icon: "loader", title: "Saving changes…", tone: "pending" },
  confirmed: { icon: "check-circle", title: "Changes saved", tone: "confirmed" },
  failed: { icon: "alert-circle", title: "Your changes weren’t saved", tone: "failed" },
  longer: { icon: "info", title: "This is taking longer than usual", tone: "pending" },
  checking: { icon: "loader", title: "Checking whether this completed…", tone: "pending" },
  unknown: { icon: "alert-circle", title: "We’re still checking this", tone: "pending" },
  stale: { icon: "info", title: "This information was updated elsewhere", tone: "neutral" },
  superseded: { icon: "info", title: "A newer change is current", tone: "neutral" },
});
