import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import sharp from "sharp";
import { createAccountService } from "../netlify/lib/account-service.js";
import { createPretransactionService } from "../netlify/lib/pretransaction-service.js";
import { createMediaService } from "../netlify/lib/media-service.js";
import { createPrincipalFence, ownerErrorCopy, ownerErrorState, readOperationMarker, writeOperationMarker } from "../src/services/ownerOperation.js";
import { completeStaffRoute } from "../netlify/lib/staff-authority.js";
import { allows } from "../src/services/staffAuthorization.js";

test("Document25 principal fence rejects late A/B/A and old resource responses, not an authorization grant",()=>{
  let uid="A",scope="Order-A";const fence=createPrincipalFence(()=>uid,()=>scope),first=fence.begin();assert.equal(fence.current(first),true);
  uid="B";fence.invalidate();assert.equal(fence.current(first),false);uid="A";assert.equal(fence.current(first),false);
  const next=fence.begin();scope="Order-B";assert.equal(fence.current(next),false);fence.dispose();assert.equal(fence.current(fence.begin()),false);
});
test("Document25 opaque pending markers reject private payloads and denied storage cannot silently start writes",()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  writeOperationMarker("A:Order",{operationId:"original-op",phase:"asset",paymentId:"opaque-payment"},storage);
  assert.deepEqual(readOperationMarker("A:Order",storage),{operationId:"original-op",phase:"asset",paymentId:"opaque-payment"});assert.equal(readOperationMarker("B:Order",storage),null);
  assert.throws(()=>writeOperationMarker("A:Order",{operationId:"op",body:"PRIVATE CHAT"},storage),{code:"operation-storage-unavailable"});
  assert.throws(()=>writeOperationMarker("A:Order",{operationId:"op"},null),{code:"operation-storage-unavailable"});
  storage.setItem("legacy","legacy-operation");assert.equal(readOperationMarker("legacy",storage).operationId,"legacy-operation");
});
test("Document25 copy distinguishes known validation, stale, access, unavailable and unknown without raw diagnostics",()=>{
  assert.equal(ownerErrorState({code:"auth/outcome-unknown"}),"unknown-result");assert.equal(ownerErrorState({code:"stale-conflict"}),"stale");assert.equal(ownerErrorState({code:"session-revoked"}),"restricted");assert.equal(ownerErrorState({code:"invalid-media"}),"validation");
  const secret=Error("Firebase RULE SECRET ID HIDDEN OBJECT");assert.ok(!ownerErrorCopy(secret,"The message").includes("SECRET"));assert.match(ownerErrorCopy({code:"auth/outcome-unknown"}),/Check its outcome/);assert.match(ownerErrorCopy({code:"operation-storage-unavailable"}),/not started/);
});
test("Document25 current Order recovery persists identity before POST and actually withdraws sensitive DOM",()=>{
  const source=readFileSync("src/pages/MyCloset/OrderWorkspace.jsx","utf8");
  assert.ok(source.indexOf("writeOperationMarker(marker")<source.indexOf('await accountRequest(staff?"staff-commercial"'));
  assert.match(source,/source\?\.scope === scope/);assert.match(source,/setSource\(null\)/);assert.match(source,/current&&current.orderId===orderId/);assert.match(source,/state:"unknown-result"/);
});
test("Document25 recovery checks are not automatic Product/media associations or repeated payment intent",()=>{
  const image=readFileSync("src/components/admin/OwnerImageField.jsx","utf8"),receipt=readFileSync("src/pages/MyCloset/ReceiptSubmission.jsx","utf8");
  assert.doesNotMatch(image,/staff-media-attach/);assert.match(image,/Use recovered photo in this draft/);
  assert.match(receipt,/media-stage-reconcile/);assert.match(receipt,/ready-submit/);assert.match(receipt,/assetId:result.assetId/);assert.match(receipt,/Continue this receipt/);
  assert.match(readFileSync("src/pages/CustomStyle/CustomStyle.jsx","utf8"),/storedDraft.uid !== user\?\.uid/);
});
test("Document25 status is announced and archive diagrams/screenshots never become application UI",()=>{
  const status=readFileSync("src/components/common/SourceStatus.jsx","utf8");assert.match(status,/aria-atomic="true"/);assert.match(status,/"assertive" : "polite"/);
  for(const file of["src/pages/MyCloset/OrderWorkspace.jsx","src/pages/MyCloset/ReceiptSubmission.jsx","src/pages/MyCloset/OrderReview.jsx","src/components/chat/TransactionConversation.jsx"])assert.doesNotMatch(readFileSync(file,"utf8"),/S16-VIS-|s16-document25|primary-contact|Section.?16 Dashboard/);
});
test("M02 exact actions/states deny malformed policy and do not splice incomplete routes",()=>{
  const staff={staffId:"staff",active:true,capabilities:{"orders.enable-payment":{domainWide:{active:true,purpose:"order-operations",actions:["read"]},selectedObject:{active:true,purpose:"order-operations",actions:["enable-payment"],ids:["other-order"]}}}}, requirement={capability:"orders.enable-payment",purpose:"order-operations",objectId:"current-order",action:"enable-payment",state:"OPEN"},claims={auth_time:1};
  assert.equal(completeStaffRoute(staff,requirement,claims,1000),false);assert.equal(allows(staff,requirement.capability,requirement),false);
  staff.capabilities[requirement.capability]={domainWide:{active:true,purpose:requirement.purpose,actions:"enable-payment-extra",states:"OPEN"}};
  assert.equal(completeStaffRoute(staff,requirement,claims,1000),false);assert.equal(allows(staff,requirement.capability,requirement),false);
});

let app,db,auth,account,cluster,media,a,b,bytes,request,blobs,writes,reads;
const id=()=>randomUUID();
async function person(){const email=`d25-${id()}@example.test`;await account.register({email,password:"Document25-Local-Password!",operationId:id()});const user=await auth.getUserByEmail(email);const claims={uid:user.uid,auth_time:Math.floor(Date.now()/1000)};return{claims,context:await account.context(claims)};}
before(async()=>{
  process.env.FIRESTORE_EMULATOR_HOST="127.0.0.1:8089";process.env.FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099";process.env.METADATA_SERVER_DETECTION="none";
  app=initializeApp({projectId:"demo-udc-d25-"+id().slice(0,8)},"d25-"+id());db=getFirestore(app);auth=getAuth(app);account=createAccountService({db,auth,secret:"document25-local-fixture-not-production"});cluster=createPretransactionService(account);a=await person();b=await person();
  request=await cluster.mutateRequest(a.claims,{operationId:id(),expectedVersion:0,expectedEpoch:a.context.epoch,fields:{notes:"PRIVATE OWNER REQUEST"}});
  bytes=await sharp({create:{width:8,height:8,channels:3,background:"#bd9b67"}}).png().toBuffer();blobs=new Map();writes=0;reads=0;
  media=createMediaService(account,cluster,{getPrivateStore:()=>({set:async(key,value)=>{writes++;blobs.set(key,Buffer.from(value));throw Error("simulated ack lost after physical storage");},get:async key=>{reads++;return blobs.get(key);}})});
});
after(async()=>{await db?.terminate();await deleteApp(app);});
const stageInput=operationId=>({operationId,domain:"custom-style",objectId:request.requestId,expectedVersion:request.version,expectedEpoch:a.context.epoch,contentType:"image/png",base64:bytes.toString("base64")});
test("M04 unknown blob write is repaired from original digest/context, without replay or domain attachment",async()=>{
  const operationId=id();await assert.rejects(media.stage(a.claims,stageInput(operationId)));assert.equal((await media.reconcileStage(a.claims,operationId)).state,"unknown");
  const result=await media.completeStage(a.claims,{operationId});assert.equal(result.state,"staged");assert.equal(writes,1);assert.equal((await media.completeStage(a.claims,{operationId})).assetId,result.assetId);assert.equal(writes,1);
  assert.deepEqual((await db.doc("customStyleRequests/"+request.requestId).get()).data().mediaRefs||[],[]);assert.equal((await db.collection("mediaReferences").where("objectId","==",request.requestId).get()).size,0);
  assert.ok(!JSON.stringify(result).includes("blobKey"));assert.equal((await media.completeStage(b.claims,{operationId})).state,"unknown");
});
test("M04 current restriction beats uncertain upload evidence before private storage is read",async()=>{
  const operationId=id();await assert.rejects(media.stage(a.claims,stageInput(operationId)));const count=reads;
  await db.doc("accounts/"+a.context.accountId).update({lifecycle:"RESTRICTED"});await assert.rejects(media.completeStage(a.claims,{operationId}),{code:"account-restricted"});assert.equal(reads,count);await db.doc("accounts/"+a.context.accountId).update({lifecycle:"ACTIVE"});
});
test("M04 changed source version, corrupt storage and older missing evidence stay unconfirmed",async()=>{
  const operationId=id();await assert.rejects(media.stage(a.claims,stageInput(operationId)));const assetId=account.keyed(`asset:${a.claims.uid}:${operationId}`),asset=(await db.doc("mediaAssets/"+assetId).get()).data();
  blobs.set(asset.blobKey,Buffer.from("corrupt"));assert.equal((await media.completeStage(a.claims,{operationId})).state,"unknown");
  await db.doc("mediaAssets/"+assetId).update({outputDigest:null});assert.equal((await media.completeStage(a.claims,{operationId})).state,"unknown");
  await db.doc("customStyleRequests/"+request.requestId).update({version:request.version+1});assert.equal((await media.completeStage(a.claims,{operationId})).state,"stale");
});
