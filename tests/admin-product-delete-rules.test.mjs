import { before, beforeEach, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { studioStaff } from "./staff-fixtures.mjs";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-udc-admin-product-delete",
    firestore: { host: "127.0.0.1", port: 8089, rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const store = context.firestore();
    await setDoc(doc(store, "admins/studio"), studioStaff());
    await setDoc(doc(store, "admins/disabled"), studioStaff(false));
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

test("product deletion stays denied without owner reference eligibility", async () => {
  const store = storeFor("studio");
  await assertFails(deleteDoc(doc(store, "products/piece")));
  await env.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(context.firestore(), "products/piece"));
    if (!snapshot.exists()) throw new Error("Denied deletion removed a protected Product");
  });
});

test("customer, disabled admin and signed-out visitor cannot delete products", async () => {
  for (const store of [storeFor("customer"), storeFor("disabled"), env.unauthenticatedContext().firestore()]) {
    await assertFails(deleteDoc(doc(store, "products/piece")));
  }
});
