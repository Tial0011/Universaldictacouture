import { before, beforeEach, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

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
    const store = context.firestore();
    await setDoc(doc(store, "admins/studio"), { active: true });
    await setDoc(doc(store, "admins/disabled"), { active: false });
    await setDoc(doc(store, "products/piece"), {
      name: "Royal Aso Oke",
      price: 25000,
      unitLabel: "per bundle",
      category: ["Aso Oke"],
      images: [{ url: "https://example.test/piece.jpg" }],
      primaryImage: { url: "https://example.test/piece.jpg" },
      status: "published",
      archived: false,
    });
  });
});

after(async () => { await env?.cleanup(); });

const storeFor = (uid) => env.authenticatedContext(uid, { email: uid + "@example.test" }).firestore();

test("active admin can permanently delete a product record", async () => {
  const store = storeFor("studio");
  await assertSucceeds(deleteDoc(doc(store, "products/piece")));
  await env.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(context.firestore(), "products/piece"));
    if (snapshot.exists()) throw new Error("Product still exists after admin deletion");
  });
});

test("customer, disabled admin and signed-out visitor cannot delete products", async () => {
  for (const store of [storeFor("customer"), storeFor("disabled"), env.unauthenticatedContext().firestore()]) {
    await assertFails(deleteDoc(doc(store, "products/piece")));
  }
});
