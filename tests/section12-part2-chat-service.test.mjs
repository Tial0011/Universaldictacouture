import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as policy from "../src/services/staffAuthorization.js";
import * as chatModel from "../src/services/chatModel.js";
import { studioStaff } from "./staff-fixtures.mjs";
import { protectedWriteDeadline, currentReadDeadline } from "../src/services/operationalRuntime.js";
import * as accountAuthority from "../src/services/customerAccountAuthority.js";

async function adapter({ storage = new Map(), records = new Map(), commit = "confirmed", readUnavailable = false } = {}) {
  const user = { uid: "principal" };
  const staff = { ...studioStaff(), principalUid: user.uid };
  const context = vm.createContext({ sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  let writes = 0;
  let serial = 0;
  const ref = (...args) => {
    const path = (args[0]?.path ? [args[0].path, ...args.slice(1)] : args.slice(1)).join("/");
    return { path, id: path.split("/").at(-1) };
  };
  records.set("conversations/customer", { assignedStaffId: staff.staffId });
  const sdk = { collection: ref, doc: (...args) => args.length === 1 ? { path: args[0].path + "/message-" + ++serial, id: "message-" + serial } : ref(...args),
    getDocFromServer: async reference => {
      if (readUnavailable && reference.path.startsWith("staffAudit/")) throw Object.assign(Error("unavailable"), { code: "unavailable" });
      return { exists: () => records.has(reference.path), data: () => records.get(reference.path) };
    }, getDocs: async () => {}, getDocsFromServer: async () => {}, limit: () => {}, onSnapshot: () => {}, orderBy: () => {}, query: () => {}, serverTimestamp: () => "trusted-time", startAfter: () => {},
    writeBatch: () => {
      const changes = [];
      return { set: (reference, data) => changes.push([reference, data]), update: (reference, data) => changes.push([reference, data]), commit: async () => {
        writes++;
        if (commit !== "unknown-absent" && commit !== "rejected") for (const [reference, data] of changes) records.set(reference.path, { ...records.get(reference.path), ...data });
        if (commit !== "confirmed") throw Object.assign(Error("lost response"), { code: commit === "rejected" ? "permission-denied" : "deadline-exceeded" });
      } };
    },
  };
  function synthetic(exports) { return new vm.SyntheticModule(Object.keys(exports), function () { for (const [name, value] of Object.entries(exports)) this.setExport(name, value); }, { context }); }
  const operations = new vm.SourceTextModule(await readFile(new URL("../src/services/staffOperations.js", import.meta.url), "utf8"), { context });
  await operations.link(() => {}); await operations.evaluate();
  const dependencies = { "firebase/firestore": synthetic(sdk), "./operations": synthetic({ readCurrentStaff: async () => staff, loadOperationalPage: async () => ({ items: [], hasMore: false }) }), "./staffAuthorization": synthetic({ allows: policy.allows }), "../firebase/auth": synthetic({ auth: { currentUser: user } }), "../firebase/firestore": synthetic({ db: {} }), "./chatModel": synthetic({ normaliseProductContext: chatModel.normaliseProductContext, prepareMessage: chatModel.prepareMessage }), "./staffOperations": operations };
  const module = new vm.SourceTextModule(await readFile(new URL("../src/services/chats.js", import.meta.url), "utf8"), { context });
  dependencies["./operationalRuntime"] = synthetic({ protectedWriteDeadline, currentReadDeadline });
  dependencies["./customerAccountAuthority"] = synthetic(accountAuthority);
  await module.link(specifier => dependencies[specifier]); await module.evaluate();
  return { service: module.namespace, user, storage, records, writes: () => writes, markers: operations.namespace };
}
const send = subject => subject.service.sendMessage({ user: subject.user, customerId: "customer", text: "Same intentional text", admin: true });
test("unknown committed send reconciles exact immutable receipt without a second write", async () => {
  const subject = await adapter({ commit: "unknown-committed" });
  await send(subject);
  assert.equal(subject.writes(), 1);
  assert.equal(await subject.service.hasPendingSend(subject.user.uid, "customer", true), false);
  assert.equal(subject.records.get("staffAudit/message-1").actorStaffId, "staff-studio");
});
test("unknown absent send remains pending across a new service instance and cannot blindly resend", async () => {
  const subject = await adapter({ commit: "unknown-absent" });
  await assert.rejects(send(subject), { code: "outcome-unknown" });
  assert.equal(await subject.service.hasPendingSend(subject.user.uid, "customer", true), true);
  const reopened = await adapter({ storage: subject.storage, records: subject.records });
  assert.equal(await reopened.service.reconcileMessage(subject.user.uid, "customer", true), "unresolved");
  await assert.rejects(send(reopened), { code: "outcome-unknown" });
  assert.equal(reopened.writes(), 0);
});
test("reopened committed handle validates the exact actor, target, action and outcome", async () => {
  const subject = await adapter();
  subject.markers.beginStaffOperation("principal/staff-studio", "chat:customer", "recovered-message");
  subject.records.set("staffAudit/recovered-message", { actorUid: "principal", actorStaffId: "staff-studio", targetCollection: "conversations", targetId: "different-customer", action: "reply", outcome: "committed" });
  assert.equal(await subject.service.reconcileMessage("principal", "customer", true), "unresolved");
  subject.records.get("staffAudit/recovered-message").targetId = "customer";
  assert.equal(await subject.service.reconcileMessage("principal", "customer", true), "committed");
  assert.equal(await subject.service.hasPendingSend("principal", "customer", true), false);
});
test("source-unavailable reconciliation and wrong account cannot authorize a duplicate", async () => {
  const subject = await adapter({ commit: "unknown-committed", readUnavailable: true });
  await assert.rejects(send(subject), { code: "outcome-unknown" });
  assert.equal(await subject.service.reconcileMessage("different-user", "customer", true), "unresolved");
  assert.equal(await subject.service.reconcileMessage("principal", "customer", true), "unresolved");
  await assert.rejects(send(subject), { code: "outcome-unknown" });
  assert.equal(subject.writes(), 1);
});
test("a confirmed rejection with an authoritative absent read unlocks a deliberate new send", async () => {
  const subject = await adapter({ commit: "rejected" });
  await assert.rejects(send(subject), { code: "permission-denied" });
  assert.equal(await subject.service.hasPendingSend("principal", "customer", true), false);
});
test("two deliberate identical messages are not text-hash deduplicated", async () => {
  const subject = await adapter();
  await send(subject); await send(subject);
  assert.equal(subject.writes(), 2);
  assert.ok(subject.records.has("staffAudit/message-1")); assert.ok(subject.records.has("staffAudit/message-2"));
});
test("Staff provider identity cannot impersonate Customer mode or send under another current principal",async()=>{
  const subject=await adapter();await assert.rejects(subject.service.sendMessage({user:subject.user,customerId:subject.user.uid,text:'Customer mode',admin:false}),{code:'account-source-unavailable'});assert.equal(subject.writes(),0);
  await assert.rejects(subject.service.sendMessage({user:{uid:'foreign'},customerId:'customer',text:'Wrong principal',admin:true}),{code:'permission-denied'});assert.equal(subject.writes(),0);
});
