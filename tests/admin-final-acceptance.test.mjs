import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { productReadiness, prepareRecord } from "../src/services/adminModel.js";

const manager = await readFile(new URL("../src/components/admin/RecordManager.jsx", import.meta.url), "utf8");
const schema = await readFile(new URL("../src/components/admin/recordSchemas.js", import.meta.url), "utf8");
const discovery = await readFile(new URL("../src/pages/admin/Discovery/Discovery.jsx", import.meta.url), "utf8");
const shopBy = await readFile(new URL("../src/services/shopBy.js", import.meta.url), "utf8");
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
const productModel = await readFile(new URL("../src/services/productModel.js", import.meta.url), "utf8");
const content = await readFile(new URL("../src/services/content.js", import.meta.url), "utf8");
const shop = await readFile(new URL("../src/pages/Shop/Shop.jsx", import.meta.url), "utf8");
const home = await readFile(new URL("../src/pages/Home/Home.jsx", import.meta.url), "utf8");

const complete = {
  id: "piece-1",
  name: "Royal Aso Oke",
  price: 25000,
  unitLabel: "per bundle",
  category: ["Aso Oke"],
  images: [{ url: "https://example.test/product.jpg" }],
  status: "draft",
};

test("Task 9A: commercial unit is a real publication requirement, not a cosmetic warning", () => {
  const missingUnit = productReadiness({ ...complete, unitLabel: "" });
  assert.equal(missingUnit.ready, false);
  assert.equal(missingUnit.blockers.some((item) => item.key === "unit"), true);
  assert.throws(
    () => prepareRecord("products", { ...complete, status: "published", unitLabel: "", primaryImage: complete.images[0] }),
    /commercial unit/i
  );
});

test("Task 9A: product lifecycle shortcuts use the same validated save path", () => {
  assert.match(manager, /async function persist\(/);
  assert.match(manager, /saveProductLifecycle/);
  assert.match(manager, /allows\(staff, "products.publish"/);
  assert.match(manager, /Archive this product\?/);
  assert.match(manager, /Product unpublished/);
  assert.match(manager, /Product archived/);
  assert.match(schema, /Publication state/);
});

test("Task 9A: configurable discovery defaults stay stable while labels, order and active state are admin-manageable", () => {
  assert.match(discovery, /Group name/);
  assert.match(discovery, /Display order/);
  assert.match(discovery, /Active in customer Shop/);
  assert.match(discovery, /stable Shop state key remains protected/);
  assert.match(shopBy, /label: String\(saved\?\.label \|\| fallback\.label\)/);
  assert.match(shopBy, /label: String\(raw\.label \|\| fallback\?\.label \|\| key\)/);
  assert.match(shopBy, /return includeInactive \? all : all\.filter/);
  assert.doesNotMatch(discovery, /Trending/);
});

test("Task 9A: deactivating every Shop By group can actually hide public discovery instead of falling back to defaults", () => {
  assert.match(content, /const definitions = Array\.isArray\(groupDefinitions\) \? groupDefinitions : SHOP_DISCOVERY_GROUPS/);
  assert.match(shop, /setShopByGroups\(groups\)/);
  assert.match(home, /setShopByGroups\(groups\)/);
});

test("Task 9A: backend and public model both reject published products missing the commercial basis", () => {
  assert.match(rules, /request\.resource\.data\.unitLabel is string/);
  assert.match(rules, /request\.resource\.data\.priceToken is string/);
  assert.match(productModel, /if \(!unitLabel\) return null/);
});
