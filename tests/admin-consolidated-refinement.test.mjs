import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const sections = await readFile(new URL("../src/components/admin/adminSections.js", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/components/navigation/AdminLayout.jsx", import.meta.url), "utf8");
const shopControl = await readFile(new URL("../src/pages/admin/Shop/ShopControl.jsx", import.meta.url), "utf8");
const manager = await readFile(new URL("../src/components/admin/RecordManager.jsx", import.meta.url), "utf8");
const schema = await readFile(new URL("../src/components/admin/recordSchemas.js", import.meta.url), "utf8");
const adminService = await readFile(new URL("../src/services/admin.js", import.meta.url), "utf8");
const imageService = await readFile(new URL("../src/services/imageStorage.js", import.meta.url), "utf8");
const imageEndpoint = await readFile(new URL("../netlify/lib/image-storage.js", import.meta.url), "utf8");
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
const adminModel = await readFile(new URL("../src/services/adminModel.js", import.meta.url), "utf8");

test("consolidated admin: only one global Shop-specific sidebar entry remains", () => {
  assert.match(sections, /label: "Shop"/);
  assert.equal((sections.match(/group: "Shop operations"/g) || []).length, 1);
  assert.doesNotMatch(sections, /label: "Products"/);
  assert.doesNotMatch(sections, /label: "Shop By"/);
  assert.doesNotMatch(sections, /label: "Categories & attributes"/);
  assert.match(layout, /shopAdminPaths/);
  assert.match(layout, /path === "\/admin\/shop" && isShopAdminPath/);
});

test("consolidated admin: Shop workspace reaches every existing Shop operation without breaking old routes", () => {
  for (const route of ["products", "taxonomy", "discovery"]) {
    assert.match(app, new RegExp(`path="${route}"`));
  }
  for (const label of ["Overview", "Products", "New In", "Shop By", "Catalogue Structure", "Search / Keywords", "Shop Health"]) {
    assert.match(shopControl, new RegExp(label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
  }
  assert.match(shopControl, /to="\/admin\/products"/);
  assert.match(shopControl, /to="\/admin\/discovery"/);
  assert.match(shopControl, /to="\/admin\/taxonomy"/);
});

test("consolidated admin: product rows open the existing editor and reclassification mutates the same record", () => {
  assert.match(manager, /className="admin-product-open"/);
  assert.match(manager, /openFromList\(record\)/);
  assert.match(manager, /nextParams\.set\("edit", record\.id\)/);
  assert.match(manager, /function updateShopBy\(group, nextValues\)/);
  assert.match(manager, /next\[group\.key\] = nextValues/);
  assert.match(manager, /type === "shopBy"/);
  assert.match(schema, /text\("category", "Categories"/);
  assert.match(schema, /text\("colour", "Colour"/);
  assert.match(schema, /text\("isNewIn", "Feature in New In"/);
  assert.match(schema, /text\("keywords", "Search keywords"/);
  assert.match(schema, /text\("aliases", "Alternative names"/);
});

test("consolidated admin: permanent product deletion is explicit and does not masquerade as archive", () => {
  assert.match(manager, /Delete product permanently/);
  assert.match(manager, /cannot be undone/);
  assert.match(manager, /Independent order, review and chat history is not deleted/);
  assert.match(adminService, /\["products", "reviews", "heroSlides"\]/);
  assert.match(adminService, /if \(kind === "products"\) return deleteProductRecord\(id\)/);
  assert.match(adminService, /await deleteDoc\(reference\)/);
  assert.doesNotMatch(adminService, /deleteDoc\(doc\(.*orders/);
});

test("consolidated admin: owned Netlify images are cleaned only after safe product deletion", () => {
  assert.match(adminService, /ownedNetlifyStorageKey/);
  assert.match(adminService, /sharedKeys/);
  assert.match(adminService, /await deleteDoc\(reference\)[\s\S]*await deleteStoredImage\(key\)/);
  assert.match(adminService, /externalReferences/);
  assert.match(imageService, /deleteStoredImage/);
  assert.match(imageService, /NETLIFY_STORAGE_KEY/);
  assert.match(imageEndpoint, /request\.method === "DELETE"/);
  assert.match(imageEndpoint, /await authorize\(request\)/);
  assert.match(imageEndpoint, /STORAGE_KEY_PATTERN\.test\(key\)/);
  assert.match(imageEndpoint, /await store\.delete\(key\)/);
});

test("consolidated admin: Firestore permits product deletion only for active admins", () => {
  const productBlock = rules.match(/match \/products\/\{productId\} \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(productBlock, /allow delete: if isAdmin\(\);/);
  assert.doesNotMatch(productBlock, /allow delete: if true/);
  assert.match(rules, /function isAdmin\(\)/);
});

test("retroactive Tasks 1-7 protections remain represented in the current admin model", () => {
  assert.match(adminService, /existingPublishedAt = raw\.publishedAt \|\| raw\.firstPublishedAt/);
  assert.match(adminModel, /productAdminHref/);
  assert.match(adminModel, /Commercial unit/);
  assert.match(adminModel, /DIMENSIONS = \["category", "occasion", "style", "fabric", "colour"\]/);
  assert.doesNotMatch(adminModel, /DIMENSIONS = \[[^\]]*"size"/);
});
