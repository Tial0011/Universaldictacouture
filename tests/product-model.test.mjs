import test from "node:test";
import assert from "node:assert/strict";
import { normaliseProduct, resolveSelections, priceForSelections, closetLineKey } from "../src/services/productModel.js";

const product = normaliseProduct("piece", {
  name: "Aso Oke", status: "published", price: 100, category: ["Fabric"],
  options: [
    { name: "Size", required: true, values: ["M", "L"] },
    { name: "Finish", required: false, values: ["Plain", "Embroidered"] },
    { name: "Fabric", required: true, values: ["Aso Oke"] },
  ],
  variants: [{ price: 150, options: { Size: "L", Finish: "Embroidered" } }],
});

test("closet selections retain optional choices and their variant price", () => {
  const selected = resolveSelections(product, { Size: "L", Finish: "Embroidered" });
  assert.equal(selected.isComplete, true);
  assert.deepEqual(selected.resolved, { Size: "L", Finish: "Embroidered", Fabric: "Aso Oke" });
  assert.equal(priceForSelections(product, selected.resolved), 150);
  assert.notEqual(closetLineKey(product.id, selected.resolved), closetLineKey(product.id, { Size: "L", Fabric: "Aso Oke" }));
});

test("missing required options block a selection; optional choices remain optional", () => {
  assert.deepEqual(resolveSelections(product).missing, ["Size"]);
  assert.equal(resolveSelections(product, { Size: "M" }).isComplete, true);
  assert.equal(resolveSelections(product, { Size: "XL", Finish: "Unknown" }).isComplete, false);
  assert.equal(resolveSelections(product, { Size: "M", Finish: "Unknown" }).resolved.Finish, undefined);
});
