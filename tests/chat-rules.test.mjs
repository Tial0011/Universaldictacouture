import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { studioStaff } from "./staff-fixtures.mjs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-udc-chat", firestore: { host: "127.0.0.1", port: 8089, rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "admins", "studio"), studioStaff());
    await setDoc(doc(context.firestore(), "admins", "disabled"), studioStaff(false));
  });
});
after(async () => { await env?.cleanup(); });
const client = uid => env.authenticatedContext(uid, { email: uid + "@example.test" }).firestore();
function send(store, customerId, senderId, { first = false, role = "customer", body = "Hello", productContext } = {}) {
  const parent = doc(store, "conversations", customerId);
  const message = doc(collection(parent, "messages"));
  const batch = writeBatch(store);
  batch.set(message, { senderId, senderRole: role, body, createdAt: serverTimestamp(), ...(productContext === undefined ? {} : { productContext }) });
  if (role === "admin") batch.set(doc(store, "staffAudit", message.id), { actorUid: senderId, actorStaffId: "staff-studio", execution: "staff", targetCollection: "conversations", targetId: customerId, action: "reply", outcome: "committed", createdAt: serverTimestamp() });
  const summary = { lastMessageId: message.id, lastMessage: body, lastSenderRole: role, updatedAt: serverTimestamp() };
  if (first) batch.set(parent, { ...summary, customerId, customerName: "Customer", customerEmail: customerId + "@example.test", createdAt: serverTimestamp() });
  else batch.update(parent, summary);
  return batch.commit();
}
test("customer starts a conversation and active admin replies; both read ordered messages", async () => {
  const customer = client("alice"), studio = client("studio");
  await assertSucceeds(send(customer, "alice", "alice", { first: true }));
  await assertSucceeds(send(studio, "alice", "studio", { role: "admin", body: "How can we help?" }));
  for (const store of [customer, studio]) {
    const result = await assertSucceeds(getDocs(query(collection(store, "conversations/alice/messages"), orderBy("createdAt", "desc"), limit(30))));
    assert.equal(result.size, 2);
  }
  await assertSucceeds(getDocs(query(collection(studio, "conversations"), orderBy("updatedAt", "desc"), limit(20))));
});
test("other customers, signed-out visitors and disabled admins cannot read or reply", async () => {
  await send(client("alice"), "alice", "alice", { first: true });
  for (const store of [client("bob"), client("disabled"), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(store, "conversations/alice")));
    await assertFails(getDocs(query(collection(store, "conversations/alice/messages"), limit(30))));
    await assertFails(send(store, "alice", "bob", { role: "admin" }));
  }
  await assertFails(getDocs(query(collection(client("alice"), "conversations"), limit(20))));
});
test("customers cannot impersonate admins, change sender identity or create another customer's chat", async () => {
  const store = client("alice");
  await assertFails(send(store, "alice", "alice", { first: true, role: "admin" }));
  await assertFails(send(store, "alice", "studio", { first: true }));
  await assertFails(send(store, "bob", "alice", { first: true }));
});
test("messages require atomic summaries, valid body size and immutable ownership", async () => {
  const store = client("alice");
  await assertFails(send(store, "alice", "alice", { first: true, body: "" }));
  await assertFails(send(store, "alice", "alice", { first: true, body: "x".repeat(2001) }));
  await send(store, "alice", "alice", { first: true });
  await assertFails(setDoc(doc(store, "conversations/alice/messages/orphan"), { senderId: "alice", senderRole: "customer", body: "Hello", createdAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(store, "conversations/alice"), { lastMessage: "Forged preview", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(store, "conversations/alice"), { customerId: "bob" }));
  const messages = await getDocs(query(collection(store, "conversations/alice/messages"), limit(30)));
  await assertFails(updateDoc(messages.docs[0].ref, { body: "Changed" }));
  await assertFails(deleteDoc(messages.docs[0].ref));
});
test("unbounded queries are denied and revoked admins lose chat access", async () => {
  await send(client("alice"), "alice", "alice", { first: true });
  const studio = client("studio");
  await assertFails(getDocs(collection(studio, "conversations")));
  await assertFails(getDocs(query(collection(studio, "conversations/alice/messages"), limit(31))));
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), "admins/studio"), studioStaff(false)));
  await assertFails(getDoc(doc(studio, "conversations/alice")));
  await assertFails(send(studio, "alice", "studio", { role: "admin" }));
});

const productTag = { productId: "piece", name: "Wine Aso Oke", slug: "wine-set", imageUrl: "https://example.test/piece.jpg", imagePublicId: "", price: 50000, variable: false, reviewId: "review" };
test("product tags persist above a message for its customer and admin only", async () => {
  await assertSucceeds(send(client("alice"), "alice", "alice", { first: true, productContext: productTag }));
  for (const store of [client("alice"), client("studio")]) {
    const result = await assertSucceeds(getDocs(query(collection(store, "conversations/alice/messages"), limit(30))));
    assert.deepEqual(result.docs[0].data().productContext, productTag);
  }
  await assertFails(getDocs(query(collection(client("bob"), "conversations/alice/messages"), limit(30))));
});
test("staff reply audit preserves durable human attribution without disclosing it to customers", async () => {
  await send(client("alice"), "alice", "alice", { first: true });
  await send(client("studio"), "alice", "studio", { role: "admin" });
  const messages = await getDocs(query(collection(client("alice"), "conversations/alice/messages"), limit(30)));
  const reply = messages.docs.find(message => message.data().senderRole === "admin");
  const evidence = await assertSucceeds(getDoc(doc(client("studio"), "staffAudit", reply.id)));
  if (evidence.data().actorStaffId !== "staff-studio") throw new Error("Durable staff attribution missing");
  await assertFails(getDoc(doc(client("alice"), "staffAudit", reply.id)));
  await assertFails(updateDoc(evidence.ref, { actorStaffId: "other-human" }));
});
test("malformed or oversized product tags cannot bypass chat validation", async () => {
  for (const tag of [null, {}, { ...productTag, name: "x".repeat(241) }, { ...productTag, price: -1 }, { ...productTag, imageUrl: "javascript:alert(1)" }, { ...productTag, extra: true }]) {
    await assertFails(send(client("alice"), "alice", "alice", { first: true, productContext: tag }));
  }
  await assertSucceeds(send(client("alice"), "alice", "alice", { first: true, productContext: { ...productTag, price: null, imageUrl: "/.netlify/functions/image?id=a" } }));
});
