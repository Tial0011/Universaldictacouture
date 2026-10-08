// Presentation/payload contracts are not durable Account or business authority.
export const PROFILE_AREAS = Object.freeze([
  { id: "overview", label: "Profile Overview" }, { id: "personal", label: "Personal Details" },
  { id: "addresses", label: "Saved Addresses" }, { id: "security", label: "Sign-in & Security" },
  { id: "communications", label: "Communications" }, { id: "privacy", label: "Privacy & Account" },
  { id: "experience", label: "Your Dicta Experience" },
]);
export const PERSONAL_DETAILS_FIELDS = Object.freeze(["profilePhoto", "fullName", "preferredName", "phoneNumber", "publicDisplayName"]);
export const COMMUNICATION_PRESETS = Object.freeze(["Important Only", "Balanced", "All Updates"]);
export const CLOSET_LINKS = Object.freeze([
  { label: "Saved Pieces", to: "/my-closet/my-pieces" }, { label: "Saved Reviews", to: "/my-closet/saved-reviews" },
  // Inherit the actual protected Order destination. No Payment-list destination
  // exists: never invent one or retarget it to saved pieces.
  { label: "Orders", to: "/my-closet/orders" }, { label: "Payments", to: null },
]);
export function profileArea(value) { return PROFILE_AREAS.some(area => area.id === value) ? value : "overview"; }
export function personalDetailsPayload(details) {
  const invalid = message => Object.assign(new Error(message), { code: "invalid-argument" });
  if (!details || typeof details !== "object" || Array.isArray(details) || Object.keys(details).some(key => !PERSONAL_DETAILS_FIELDS.includes(key))) throw invalid("Only current Personal Details fields may be changed.");
  return Object.fromEntries(Object.entries(details).map(([key, value]) => {
    // A reference grants neither private retrieval nor publication consent.
    if (key === "profilePhoto") { if (value !== null && (typeof value !== "string" || !value.trim())) throw invalid("Choose a valid private photo reference."); return [key, value]; }
    if (typeof value !== "string") throw invalid("Enter a text value.");
    const text = value.trim();
    if (["fullName", "phoneNumber"].includes(key) && !text) throw invalid("Complete the required Personal Details field.");
    return [key, text];
  }));
}
export function personalDetailsProjection(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Object.assign(new Error("Current Profile information could not be checked."), { code: "profile-source-unavailable" });
  return Object.fromEntries(PERSONAL_DETAILS_FIELDS.filter(key => Object.hasOwn(raw, key)).map(key => {
    const value = raw[key];
    if (typeof value !== "string" && !(key === "profilePhoto" && value === null)) throw Object.assign(new Error("Current Profile information could not be checked."), { code: "profile-source-unavailable" });
    return [key, value];
  }));
}
export function publicProfileIdentity(profile) { return typeof profile?.publicDisplayName === "string" && profile.publicDisplayName.trim() ? profile.publicDisplayName.trim() : null; }
export function meaningfulPersonalConflict(baseline, current, unsaved) {
  return PERSONAL_DETAILS_FIELDS.filter(key => Object.hasOwn(unsaved, key) && unsaved[key] !== baseline[key] && current[key] !== baseline[key] && current[key] !== unsaved[key]);
}
export function identityBoundRequests() {
  let principal = null, generation = 0;
  const selections = new Map();
  return {
    reset(uid) { principal = uid; generation++; selections.clear(); },
    begin(channel) { if (!principal || typeof channel !== "string" || !channel) return null; const selection = (selections.get(channel) || 0) + 1; selections.set(channel, selection); return Object.freeze({ principal, generation, channel, selection }); },
    invalidate(channel) { selections.set(channel, (selections.get(channel) || 0) + 1); },
    current(ticket) { return Boolean(principal && ticket && ticket.principal === principal && ticket.generation === generation && selections.get(ticket.channel) === ticket.selection); },
  };
}
