import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPERATIONAL_STATES, runtimeErrorState, runtimeStateMessage, protectedWriteDeadline, currentReadDeadline, ownsCommittedReceipt } from "../src/services/operationalRuntime.js";
import { beginStaffOperation, pendingStaffOperation } from "../src/services/staffOperations.js";
test("canonical state distinctions do not collapse denied, unavailable, timeout and unknown", () => {
  assert.equal(runtimeErrorState({code:"permission-denied"}),"restricted");
  assert.equal(runtimeErrorState({code:"deadline-exceeded"}),"connection-problem");
  assert.equal(runtimeErrorState({code:"source-unavailable"}),"source-unavailable");
  assert.equal(runtimeErrorState({code:"outcome-unknown"}),"unknown-result");
  assert.notEqual(runtimeStateMessage("restricted"),runtimeStateMessage("unavailable"));
  assert.notEqual(runtimeStateMessage("source-unavailable"),runtimeStateMessage("empty"));
  for(const state of ["partial-loading","dormant","archived","checking-result","resolved-elsewhere"])assert.ok(OPERATIONAL_STATES.includes(state));
});
test("a write timeout is unknown and does not cancel or falsely classify a late commit", async () => {
  let commit;
  let committed=false;
  const operation=new Promise(resolve=>{commit=()=>{committed=true;resolve("committed");};});
  await assert.rejects(protectedWriteDeadline(operation,2),{code:"outcome-unknown"});
  assert.equal(committed,false); commit();
  assert.equal(await operation,"committed");
  assert.equal(committed,true);
});
test("read deadlines remain recoverable reads, not unknown mutations", async () => {
  await assert.rejects(currentReadDeadline(new Promise(()=>{}),2),{code:"deadline-exceeded"});
  assert.equal(await protectedWriteDeadline(Promise.resolve("receipt"),20),"receipt");
});
test("a protected recovery handle cannot be overwritten by another intended operation", () => {
  const values=new Map();const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  beginStaffOperation("uid/staff","products","one",storage);
  assert.throws(()=>beginStaffOperation("uid/staff","products","two",storage),{code:"outcome-unknown"});
  assert.equal(pendingStaffOperation("uid/staff","products",storage).operationId,"one");
  beginStaffOperation("uid/staff","products","one",storage);
  assert.throws(()=>beginStaffOperation("uid/staff","other","a/b",storage),{code:"failed-precondition"});
});
test("only current actor and exact pending receipt can confirm a protected result", () => {
  const staff={principalUid:"uid",staffId:"staff"};const receipt={actorUid:"uid",actorStaffId:"staff",execution:"staff",outcome:"committed",action:"save"};
  assert.equal(ownsCommittedReceipt(receipt,staff,"op",{operationId:"op"}),true);
  for(const data of [{...receipt,actorUid:"different"},{...receipt,actorStaffId:"different"},{...receipt,outcome:"unknown"},{...receipt,action:"reply"}])assert.equal(ownsCommittedReceipt(data,staff,"op",{operationId:"op"}),false);
  assert.equal(ownsCommittedReceipt(receipt,staff,"op",null),false);
  assert.equal(ownsCommittedReceipt(receipt,staff,"op",{operationId:"other"}),false);
});
test("history restoration and offline access withdraw cached staff handoff before revalidation", () => {
  const source=readFileSync(new URL("../src/services/admin.js",import.meta.url),"utf8");
  assert.match(source,/event.persisted/);
  assert.match(source,/window.addEventListener\("pageshow", pageRestore\)/);
  assert.match(source,/generation\+\+; next\(null, "connection-problem"\)/);
  assert.match(source,/currentReadDeadline\(getDocFromServer\(receipt\)\)/);
});
test("Attention context is read-only and scoped, with modal keyboard/focus mechanics", () => {
  const source=readFileSync(new URL("../src/components/admin/AttentionContext.jsx",import.meta.url),"utf8");
  assert.match(source,/dialog.current.showModal\(\)/);
  assert.match(source,/opener.focus\(\)/);
  assert.match(source,/resolveOperationalOpen/);
  assert.doesNotMatch(source,/setDoc|writeBatch|privateMedia|measurements|lastMessage/);
});
test("staff framing and private document metadata are blocked without replacing trusted authorization", () => {
  const entry=readFileSync(new URL("../src/components/admin/AdminAccess.jsx",import.meta.url),"utf8");
  assert.match(entry,/window.self !== window.top/);
  assert.match(entry,/uid && !framed/);
  const config=readFileSync(new URL("../netlify.toml",import.meta.url),"utf8");
  assert.match(config,/for = "\/admin"/);assert.match(config,/for = "\/admin\/\*"/);
  assert.match(config,/X-Frame-Options = "DENY"/);assert.match(config,/Cache-Control = "no-store"/);
});
test("whole-section register uses all exact 501 official flows and rejects an implementation lock", () => {
  const coverage=JSON.parse(readFileSync(new URL("../docs/section12-final-coverage.json",import.meta.url),"utf8"));
  assert.equal(coverage.lockCandidate,false);assert.equal(coverage.verdict,"PARTIAL");
  assert.deepEqual(coverage.modules.map(module=>module.flowCount),[10,12,12,20,24,25,25,22,21,22,21,22,23,25,38,41,31,37,40,30]);
  const flows=coverage.modules.flatMap(module=>module.flows);assert.equal(flows.length,501);assert.equal(new Set(flows.map(flow=>flow.id)).size,501);
  assert.ok(flows.every(flow=>flow.reason&&flow.evidence.length&&(flow.disposition!=="EXTERNAL OWNER DEPENDENCY"||flow.owner)));
  for(const module of coverage.modules)assert.deepEqual(module.flows.map(flow=>flow.id),Array.from({length:module.flowCount},(_,index)=>`S12-M${String(module.module).padStart(2,"0")}-F${String(index+1).padStart(2,"0")}`));
  const finalPart=JSON.parse(readFileSync(new URL("../docs/section12-part4-coverage.json",import.meta.url),"utf8"));
  assert.equal(finalPart.modules.flatMap(module=>module.flows).length,179);
});
test("surface/component/journey gates account for missing owner work rather than copy architecture PASS", () => {
  const audit=JSON.parse(readFileSync(new URL("../docs/section12-final-integration-audit.json",import.meta.url),"utf8"));
  assert.equal(audit.surfaces.length,15);assert.equal(audit.componentFamilies.length,11);assert.equal(audit.journeys.length,12);
  assert.equal(audit.journeys.filter(journey=>journey.status==='VALIDATED BACKED').length,3);
  assert.equal(audit.lockCandidate,false);assert.ok(audit.dependencies.every(dependency=>dependency.owner&&dependency.flows.length&&dependency.locations.length&&dependency.correction));
});
test("owner overview source failure is local and cannot fabricate a checked zero/readiness result", () => {
  const source=readFileSync(new URL("../src/pages/admin/Shop/ShopControl.jsx",import.meta.url),"utf8");
  assert.match(source,/Promise.allSettled/);assert.match(source,/state.productChecked/);assert.match(source,/canContent \? currentReadDeadline/);
  assert.doesNotMatch(source,/state.counts\.draft \?\? 0/);
});
