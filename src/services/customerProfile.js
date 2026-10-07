import { requireCustomerAccountAuthority } from "./customerAccountAuthority";
import { personalDetailsPayload } from "./profileExperience";

export async function saveCustomerProfile(_user, details = {}) {
  requireCustomerAccountAuthority();
  personalDetailsPayload(details);
  // Never re-enable the old provider-UID merge/upsert as a fallback. It has
  // no durable binding, lifecycle, historical or stale-version enforcement.
  throw Object.assign(new Error("The current Profile owner service is unavailable."), { code: "profile-source-unavailable" });
}

export async function fetchCustomerProfile(_uid) {
  requireCustomerAccountAuthority();
  throw Object.assign(new Error("The current Profile owner service is unavailable."), { code: "profile-source-unavailable" });
}
