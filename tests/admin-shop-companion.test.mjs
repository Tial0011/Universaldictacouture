import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const sections = await readFile(new URL("../src/components/admin/adminSections.js", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/components/navigation/AdminLayout.jsx", import.meta.url), "utf8");
const layoutCss = await readFile(new URL("../src/components/navigation/AdminLayout.css", import.meta.url), "utf8");
const manager = await readFile(new URL("../src/components/admin/RecordManager.jsx", import.meta.url), "utf8");
const imageField = await readFile(new URL("../src/components/admin/ImageField.jsx", import.meta.url), "utf8");
const shopControl = await readFile(new URL("../src/pages/admin/Shop/ShopControl.jsx", import.meta.url), "utf8");
const discovery = await readFile(new URL("../src/pages/admin/Discovery/Discovery.jsx", import.meta.url), "utf8");
const shopBy = await readFile(new URL("../src/services/shopBy.js", import.meta.url), "utf8");
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");

test("Protected Product owner routing retains the existing workspace", () => {
  assert.match(app, /<AdminAccess>[\s\S]*<AdminLayout \/>/);
  assert.match(app, /path="shop" element=\{<StaffRoute domain="products"><AdminShop \/>/);
  assert.match(sections, /label: "Products"/);
  assert.match(sections, /domain: "products"/);
  assert.match(layout, /isShopAdminPath/);
  assert.match(layout, /ShopWorkspaceNav/);
});

test("Task 8A: Shop Control maps customer Shop systems to clear admin destinations", () => {
  assert.match(shopControl, /Manage products/);
  assert.match(shopControl, /Manage New In/);
  assert.match(shopControl, /Manage Shop By/);
  assert.match(shopControl, /Manage labels/);
  assert.match(shopControl, /View customer Shop/);
  assert.match(shopControl, /Routing &amp; SEO health/);
  assert.match(shopControl, /SHOP_SEO\.canonicalPath/);
});

test("Task 8A: Product Manager surfaces readiness, New In and safe public preview", () => {
  assert.match(manager, /Publication readiness/);
  assert.match(manager, /productReadiness\(record\)/);
  assert.match(manager, /needs-attention/);
  assert.match(manager, /new-in/);
  assert.match(manager, /View in Shop/);
  assert.match(manager, /record\.status === "published"/);
  assert.match(manager, /allows\(staff, "products.publish"/);
  assert.match(manager, /saveProductLifecycle\("unpublished"\)/);
  assert.match(manager, /Restore to Unpublished/);
  assert.match(manager, /saveProductLifecycle\("archived"\)/);
});

test("Task 9A: Shop By admin can inspect inactive groups, reorder them and preview real customer state", () => {
  assert.match(discovery, /includeInactive: true/);
  assert.match(discovery, /Display order/);
  assert.match(discovery, /Active in customer Shop/);
  assert.match(discovery, /Preview in Shop/);
  assert.match(shopBy, /includeInactive = false/);
  assert.match(shopBy, /shopByDestination/);
});

test("Task 8A: image administration identifies the cover and gives non-destructive large-image guidance", () => {
  assert.match(imageField, /Photo 1 is the primary image/);
  assert.match(imageField, /Large image selected/);
  assert.match(imageField, /Make cover/);
  assert.match(imageField, /Move earlier/);
  assert.match(imageField, /Move later/);
});

test("Task 8A: admin accessibility/responsiveness keeps focus and reduced-motion treatment", () => {
  assert.match(layoutCss, /admin-section-card:focus-visible/);
  assert.match(layoutCss, /admin-readiness__checks/);
  assert.match(layoutCss, /@media \(max-width: 899px\)/);
  assert.match(layoutCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Task 8A: Firestore keeps admin writes protected and excludes Size from Shop V1 taxonomy writes", () => {
  assert.match(rules, /function canStaff\(/);
  assert.match(rules, /allow create, update: if canStaff\(/);
  assert.match(rules, /dimension in \['category', 'occasion', 'style', 'fabric', 'colour'\]/);
  assert.match(rules, /request\.resource\.data\.unitLabel is string/);
  assert.doesNotMatch(rules, /dimension in \[[^\]]*'size'/);
});
