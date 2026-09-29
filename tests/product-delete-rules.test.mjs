import { before, beforeEach, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-udc-product-delete",
    firestore: { host: "127.0.0.1", port: 8089, rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "admins", "studio"), { active: true });
    await setDoc(doc(context.firestore(), "admins", "disabled"), { active: false });
    await setDoc(doc(context.firestore(), "products", "piece-1"), {
      name: "Royal Aso Oke",
      status: "draft",
      archived: false,
      price: 25000,
      unitLabel: "per bundle",
      category: ["Aso Oke"],
      images: [{ url: "https://example.test/piece.jpg" }],
    });
  });
});
after(async () => { await env?.cleanup(); });

const client = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();

test("active admin can permanently delete a product record", async () => {
  await assertSucceeds(deleteDoc(doc(client("studio"), "products", "piece-1")));
});

test("customer, disabled admin and signed-out visitor cannot delete products", async () => {
  await assertFails(deleteDoc(doc(client("customer"), "products", "piece-1")));
  await assertFails(deleteDoc(doc(client("disabled"), "products", "piece-1")));
  await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), "products", "piece-1")));
});
