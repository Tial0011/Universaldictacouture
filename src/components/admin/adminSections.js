export const ADMIN_SECTIONS = [
<<<<<<< HEAD
  { path: "/admin/chats", label: "Chats", group: "Customers", description: "Read customer messages and reply directly from your studio inbox.", action: "Open inbox" },
  { path: "/admin/products", label: "Products", group: "Catalogue", description: "Add pieces, set prices and choose what is available in your shop.", action: "Manage products" },
  { path: "/admin/taxonomy", label: "Categories & attributes", group: "Catalogue", description: "Keep category, colour and size labels consistent. Shop By choices are managed separately.", action: "Organise labels" },
  { path: "/admin/homepage", label: "Homepage", group: "Website content", description: "Update, remove or delete homepage hero slides and their desktop/mobile images.", action: "Edit homepage" },
  { path: "/admin/appearance", label: "Website Appearance", group: "Website content", description: "Update approved authentication imagery and other controlled website visuals.", action: "Edit appearance" },
  { path: "/admin/discovery", label: "Shop By", group: "Website content", description: "Manage Occasion, Style, Fabric & Pattern and any extra Shop By groups.", action: "Manage Shop By" },
  { path: "/admin/reviews", label: "Customer reviews", group: "Website content", description: "Review customer feedback and choose what appears on the website.", action: "Manage reviews" },
=======
  {path:'/admin/notifications',domain:'notifications',label:'Notifications',group:'Operations',description:'Your permitted Staff communication history.',action:'Open Notifications'},
  {path:'/admin/content',domain:'content',label:'Content',group:'Commerce',description:'Open existing authorized content destinations.',action:'Open Content'},
  { path: "/admin/products", domain: "products", label: "Products", group: "Operations", description: "Open the authoritative Product workspace.", action: "Open Products" },
  { path: "/admin/chats", domain: "chats", label: "Chats", group: "Operations", description: "Open currently accessible customer conversations.", action: "Open Chats" },
  { path: "/admin/customers", domain: "customers", label: "Customers", group: "Operations", description: "Customer operational context from the Account owner.", action: "Open Customers" },
  { path: "/admin/orders", domain: "orders", label: "Orders & Operations", group: "Operations", description: "Order and Extension operational visibility.", action: "Open Orders" },
  { path: "/admin/payments", domain: "payments", label: "Payments", group: "Operations", description: "Payment status and protected owner-workflow routing.", action: "Open Payments" },
  { path: "/admin/custom-style", domain: "customStyle", label: "Custom Style", group: "Operations", description: "Custom Style operational context.", action: "Open Custom Style" },
  { path: "/admin/reviews", domain: "reviews", label: "Review & Feeds", group: "Commerce", description: "Read permitted Review state and owner handoff context.", action: "Open Reviews" },
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
];

export const SHOP_ADMIN_PATHS = ["/admin/shop", "/admin/products", "/admin/discovery", "/admin/taxonomy"];
export function isShopAdminPath(pathname = "") {
  return SHOP_ADMIN_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}
