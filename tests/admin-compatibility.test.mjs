import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeStaffMembership,staffMembershipState,currentStaff,allows,canDiscover,DEVELOPMENT_LEGACY_ADMIN_CAPABILITIES,LEGACY_DEVELOPMENT_ADMIN_MODE} from "../src/services/staffAuthorization.js";
import {legacyDevelopmentAdmin,studioStaff} from "./staff-fixtures.mjs";
import {requireAdmin} from "../netlify/lib/image-storage.js";
const read=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
test("canonical staff and its explicit grants retain object identity and never receive legacy escalation",()=>{
  for(const raw of [studioStaff(),{active:true,staffId:"narrow",capabilities:{"products.read":{selectedObject:{active:true,purpose:"catalogue",ids:["one"]}}}},{active:true,staffId:"zero",capabilities:{}}])assert.equal(normalizeStaffMembership("principal",raw),raw);
  const canonical=normalizeStaffMembership("principal",{active:true,staffId:"zero",capabilities:{}});assert.equal(currentStaff(canonical),true);assert.equal(canDiscover(canonical,"products"),false);
});
test("two active pre-migration memberships normalize to isolated effective development contexts, without modifying source",()=>{
  for(const uid of ["owner-existing","second-existing"]){const raw=legacyDevelopmentAdmin();const before=JSON.stringify(raw);const staff=normalizeStaffMembership(uid,raw);assert.equal(staff.compatibilityMode,LEGACY_DEVELOPMENT_ADMIN_MODE);assert.equal(staff.staffId,"legacy-dev:"+uid);assert.equal(staff.capabilities,DEVELOPMENT_LEGACY_ADMIN_CAPABILITIES);assert.equal(currentStaff(staff),true);assert.equal(JSON.stringify(raw),before);for(const domain of ["products","chats","reviews","content","customers","orders","payments","customStyle","audit"])assert.equal(canDiscover(staff,domain),true);}
});
test("absent/inactive/malformed/partial canonical membership cannot enter legacy mode, regardless of role strings",()=>{
  for(const raw of [null,legacyDevelopmentAdmin(false),{active:"true",role:"Super Admin"},{active:true,staffId:""},{active:true,capabilities:{}},{active:true,staffId:null}])assert.equal(currentStaff(normalizeStaffMembership("principal",raw)),false);
  assert.equal(staffMembershipState("principal",null),"no-membership");assert.equal(staffMembershipState("principal",legacyDevelopmentAdmin(false)),"inactive");assert.equal(staffMembershipState("principal",{active:true,capabilities:{}}),"awaiting-migration");assert.equal(normalizeStaffMembership("",legacyDevelopmentAdmin()),null);
});
test("bridge grants only enumerated historical inspection/owner actions, with exact purpose; no publish/delete/financial/governance shortcuts",()=>{
  const staff=normalizeStaffMembership("existing",legacyDevelopmentAdmin());
  assert.equal(allows(staff,"products.edit",{purpose:"catalogue",objectId:"p"}),true);
  assert.equal(allows(staff,"media.upload",{purpose:"public-media"}),true);
  assert.equal(allows(staff,"products.edit",{purpose:"payment-operations"}),false);
  for(const cap of ["products.publish","products.delete","payments.verify","staff.manage","media.delete"])assert.equal(allows(staff,cap,{purpose:"catalogue"}),false);
});
test("all actual membership consumers use the one adapter, including trusted media and commit-time authority",()=>{
  for(const file of ["src/services/admin.js","src/services/operations.js","netlify/lib/image-storage.js"])assert.match(read(file),/normalizeStaffMembership/);
  assert.match(read("src/services/admin.js"),/normalizeStaffMembership\(staff.principalUid, membership.exists\(\)/);
  for(const file of ["src/components/admin/StaffRoute.jsx","src/components/navigation/AdminLayout.jsx"])assert.doesNotMatch(read(file),/legacyDevelopmentMembership|role ===|role ==/);
});
test("Firestore capability contract stays exactly aligned with the central JS bridge",()=>{
  const rules=read("firestore.rules");const body=rules.slice(rules.indexOf("function legacyDevelopmentCapability"),rules.indexOf("function effectiveStaffId"));
  const caps=[...body.matchAll(/'(products\.[^']+|content\.[^']+|chats\.[^']+|reviews\.[^']+|media\.[^']+|audit\.[^']+|operations\.[^']+|customers\.[^']+|orders\.[^']+|payments\.[^']+|customStyle\.[^']+)'/g)].map(match=>match[1]);
  assert.deepEqual(caps.sort(),Object.keys(DEVELOPMENT_LEGACY_ADMIN_CAPABILITIES).sort());
  for(const grant of Object.values(DEVELOPMENT_LEGACY_ADMIN_CAPABILITIES))assert.ok(body.includes("purpose == '"+grant.domainWide.purpose+"'"));
  assert.match(rules,/!staff.keys\(\).hasAny\(\['staffId', 'capabilities'\]\)/);assert.match(rules,/allow list, write: if false/);
});
test("Netlify image authorization resolves real legacy membership centrally and still rejects absent/inactive membership",async()=>{
  const request=new Request("https://example.test/.netlify/functions/images",{method:"POST",headers:{Authorization:"Bearer fixture-token"}});const config={FIREBASE_WEB_API_KEY:"fixture",FIREBASE_PROJECT_ID:"fixture"};
  for(const raw of [null,{fields:{active:{booleanValue:false}}},{fields:{active:{booleanValue:true}}}]){const responses=[Response.json({users:[{localId:"legacy"}]}),raw?Response.json(raw):Response.json({},{status:404})];const result=requireAdmin(request,config,async()=>responses.shift());if(raw?.fields.active.booleanValue===true)assert.equal(await result,"legacy-dev:legacy");else await assert.rejects(result,error=>error.status===403);}
});
