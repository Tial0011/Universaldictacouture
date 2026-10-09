export const ADMIN_SECTIONS = [
  {path:'/admin/notifications',domain:'notifications',label:'Notifications',group:'Operations',description:'Your permitted Staff communication history.',action:'Open Notifications'},
  {path:'/admin/content',domain:'content',label:'Content',group:'Commerce',description:'Open existing authorized content destinations.',action:'Open Content'},
  { path: "/admin/products", domain: "products", label: "Products", group: "Operations", description: "Open the authoritative Product workspace.", action: "Open Products" },
  { path: "/admin/chats", domain: "chats", label: "Chats", group: "Operations", description: "Open currently accessible customer conversations.", action: "Open Chats" },
  { path: "/admin/customers", domain: "customers", label: "Customers", group: "Operations", description: "Customer operational context from the Account owner.", action: "Open Customers" },
  { path: "/admin/orders", domain: "orders", label: "Orders & Operations", group: "Operations", description: "Order and Extension operational visibility.", action: "Open Orders" },
  { path: "/admin/payments", domain: "payments", label: "Payments", group: "Operations", description: "Payment status and protected owner-workflow routing.", action: "Open Payments" },
  { path: "/admin/custom-style", domain: "customStyle", label: "Custom Style", group: "Operations", description: "Custom Style operational context.", action: "Open Custom Style" },
  { path: "/admin/reviews", domain: "reviews", label: "Review & Feeds", group: "Commerce", description: "Read permitted Review state and owner handoff context.", action: "Open Reviews" },
];

export const SHOP_ADMIN_PATHS = ["/admin/shop", "/admin/products", "/admin/discovery", "/admin/taxonomy"];
export function isShopAdminPath(pathname = "") {
  return SHOP_ADMIN_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}
