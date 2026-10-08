import { personalDetailsPayload } from "./profileExperience";
import { accountRequest } from "./accountApi";

export async function saveCustomerProfile(user, details = {}, { operationId, expectedVersion, expectedEpoch } = {}) {
  return accountRequest("profile-save", { operationId, expectedVersion, expectedEpoch, fields: personalDetailsPayload(details) }, { principalUid: user?.uid });
}

export async function fetchCustomerProfile(uid) {
  return accountRequest("profile", {}, { principalUid: uid });
}
