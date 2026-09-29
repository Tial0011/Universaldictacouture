import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareRecord, productReadiness } from "../src/services/adminModel.js";
import { ownedNetlifyStorageKeys } from "../src/services/imageStorageModel.js";

const sections = await readFile(new URL("../src/components/admin/adminSections.js", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/components/navigation/AdminLayout.jsx", import.meta.url), "utf8");
const workspace = await readFile(new URL("../src/components/admin/ShopWorkspaceNav.jsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const manager = await readFile(new URL("../src/components/admin/RecordManager.jsx", import.meta.url), "utf8");
const adminService = await readFile(new URL("../src/services/admin.js", import.meta.url), "utf8");
const imageService = await readFile(new URL("../src/services/imageStorage.js", import.meta.url), "utf8");
const imageModel = await readFile(new URL("../src/services/imageStorageModel.js", import.meta.url), "utf8");
const imageHandler = await readFile(new URL("../netlify/lib/image-storage.js", import.meta.url), "utf8");
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");

const product = {
  id: "royal-aso-oke",
  name: "Royal Aso Oke",
  description: "Handwoven fabric",
  price: 25000,
  unitLabel: "per bundle",
  category: ["Aso Oke"],
  occasion: ["Wedding Guest"],
  style: ["Draped Style"],
  fabric: ["Loom"],
  colour: ["Wine"],
  shopBy: { occasion: ["Wedding Guest"], style: ["Draped Style"], fabric: ["Loom"] },
  images: [{ url: "https://example.test/a.jpg" }],
  primaryImage: { url: "https://example.test/a.jpg" },
  isNewIn: false,
  status: "draft",
};

test("consolidated admin renders one global Shop entry and keeps Shop operations inside the workspace", () => {
  const shopPathOccurrences = sections.match(/path: "\/admin\/shop"/g) || [];
  assert.equal(shopPathOccurrences.length, 1);
  assert.doesNotMatch(sections, /label: "Products"/);
  assert.doesNotMatch(sections, /label: "Shop By"/);
  assert.doesNotMatch(sections, /label: "Categories & attributes"/);
  assert.match(layout, /isShopAdminPath/);
  assert.match(layout, /ShopWorkspaceNav/);
  for (const label of ["Overview", "Products", "New In", "Shop By", "Catalogue Structure", "Search \/ Keywords", "Shop Health"]) assert.match(workspace, new RegExp(label));
});

test("legacy Shop admin routes remain directly routable", () => {
  assert.match(app, /path="shop" element=\{<AdminShop \/>\}/);
  assert.match(app, /path="products" element=\{<AdminProducts \/>\}/);
  assert.match(app, /path="discovery" element=\{<AdminDiscovery \/>\}/);
  assert.match(app, /path="taxonomy" element=\{<AdminTaxonomy \/>\}/);
});

test("product list opens a real existing record and provides practical loaded-record filtering and sorting", () => {
  assert.match(manager, /Open .* for editing/);
  assert.match(manager, /openManagedRecord\(record\)/);
  assert.match(manager, /Find by product name, ID or slug/);
  assert.match(manager, /All classifications/);
  assert.match(manager, /Product name A–Z/);
  assert.match(manager, /Newest publication/);
  assert.match(manager, /Recently updated/);
});

test("existing product reclassification and merchandising do not require recreation", () => {
  const moved = prepareRecord("products", {
    ...product,
    occasion: ["Church / Special Event"],
    shopBy: { ...product.shopBy, occasion: ["Church / Special Event"], fabric: ["Big Rope"] },
    isNewIn: true,
    aliases: ["Royal weave"],
  });
  assert.deepEqual(moved.occasion, ["Church / Special Event"]);
  assert.deepEqual(moved.shopBy.occasion, ["Church / Special Event"]);
  assert.deepEqual(moved.shopBy.fabric, ["Big Rope"]);
  assert.equal(moved.isNewIn, true);
  assert.deepEqual(moved.aliases, ["Royal weave"]);
  assert.equal(productReadiness({ ...moved, id: product.id }).ready, true);
  assert.match(manager, /updateShopBy/);
  assert.match(manager, /Feature in New In|isNewIn/);
});

test("permanent product deletion is deliberate and uses the product deletion service", () => {
  assert.match(manager, /Delete Product/);
  assert.match(manager, /Delete “\{record\.name/);
  assert.match(manager, /cannot be undone/);
  assert.match(manager, /Delete permanently/);
  assert.match(manager, /deleteProductPermanently/);
  assert.match(adminService, /\["products", "reviews", "heroSlides"\]/);
  assert.match(adminService, /await deleteAdminRecord\("products", record\.id\)/);
  assert.match(adminService, /cleanupOwnedProductImages/);
});

test("owned media cleanup only targets Netlify-managed UUID WebP keys and ignores legacy/external media", () => {
  const keys = ownedNetlifyStorageKeys({
    primaryImage: { provider: "netlify", storageKey: "00000000-0000-0000-0000-000000000000.webp" },
    images: [
      { provider: "netlify", storageKey: "00000000-0000-0000-0000-000000000000.webp" },
      { provider: "cloudinary", publicId: "legacy/piece" },
      { url: "https://example.test/external.jpg" },
      { provider: "netlify", storageKey: "../../unsafe" },
    ],
  });
  assert.deepEqual(keys, ["00000000-0000-0000-0000-000000000000.webp"]);
  assert.match(imageModel, /provider === "netlify"/);
  assert.match(imageHandler, /request\.method === "DELETE"/);
  assert.match(imageHandler, /KEY\.test\(key\)/);
  assert.match(imageHandler, /await authorize\(request\)/);
  assert.match(imageHandler, /await getStore\(\)\.delete\(key\)/);
});

test("Firestore permits product deletion only through the existing active-admin gate", () => {
  const productBlock = rules.match(/match \/products\/\{productId\} \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(productBlock, /allow delete: if isAdmin\(\);/);
  assert.match(rules, /function isAdmin\(\)/);
  assert.doesNotMatch(productBlock, /allow delete: if true/);
});

test("Task 8A/9A safeguards remain intact", () => {
  assert.equal(productReadiness({ ...product, unitLabel: "" }).ready, false);
  assert.doesNotMatch(manager, /Size filter/);
  assert.match(manager, /Publication readiness/);
  assert.match(manager, /saveProductLifecycle\("published"\)/);
  assert.match(manager, /saveProductLifecycle\("archived"\)/);
  assert.match(manager, /Manage Shop By groups & choices/);
});
