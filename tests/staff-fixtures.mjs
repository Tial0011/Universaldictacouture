export const route = purpose => ({ domainWide: { active: true, purpose } });
export const legacyDevelopmentAdmin = (active = true) => ({ active, role: "Admin" });
export function studioStaff(active = true) {
  return { active, staffId: "staff-studio", capabilities: {
    "products.read": route("catalogue"), "products.create": route("catalogue"), "products.edit": route("catalogue"), "products.commercial": route("catalogue"), "products.media": route("catalogue"), "products.discovery": route("catalogue"), "products.publish": route("catalogue"), "products.archive": route("catalogue"), "products.unpublish": route("catalogue"), "products.restore": route("catalogue"),
    "content.read": route("content"), "content.edit": route("content"), "content.delete": route("content"),
    "chats.read": route("customer-service"), "chats.reply": route("customer-service"),
    "reviews.read": route("moderation"), "media.upload": route("public-media"), "audit.read": route("audit"), "operations.reconcile": route("operation-result"),
  } };
}
