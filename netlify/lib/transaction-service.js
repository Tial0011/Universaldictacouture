import { exactFields, fail, identifier, requireFresh } from "./account-contract.js";
import { resolveStaff } from "./staff-authority.js";
import { publicProduct } from "./pretransaction-service.js";
import { resolveSelections } from "../../src/services/productModel.js";
import { reviewIsPublic } from "../../src/services/reviewModel.js";
import { createConfigurationService } from "./shared-configuration.js";

const clone = value => structuredClone(value);
const money = value => { if (!Number.isSafeInteger(value) || value < 0) fail("invalid-argument", 400); return value; };
export function createTransactionService(account) {
  const { db, ref, now, keyed, customer } = account;
  const configuration = createConfigurationService(account);
  const orderRef = id => ref(`orders/${identifier(id)}`);
  const workRef = (orderId, componentId = "base") => ref(`orders/${identifier(orderId)}/work/${identifier(componentId)}`);
  const chatIdFor = orderId => `order:${orderId}`;
  const publicReviews = (tx,orderId) => tx.get(db.collection("accountReviews").where("orderId","==",orderId).where("published","==",true).limit(200));
  function publicSignals(tx,rows,eligible){for(const row of rows.docs)tx.set(ref(`reviewPublicState/${row.id}`),{publicAllowed:Boolean(eligible&&reviewIsPublic(row.data())),version:row.data().version});}
  const isStaff = claims => claims._session?.kind === "staff" || claims.kind === "staff";
  async function authority(tx, claims, order, action, { domain = "orders", purpose = "order-operations", dataClass, objectId, fresh = false, newWork = false } = {}) {
    if (!order || order._ownerVersion !== 3) fail();
    if (!isStaff(claims)) {
      const owner = await customer(tx, claims);
      if (order.accountId !== owner.accountId) fail();
      if (fresh) requireFresh(claims, 300, now());
      return { kind: "customer", accountId: owner.accountId, epoch: owner.epoch };
    }
    const staff = await resolveStaff(tx, db, claims, { capability: `${domain}.${action}`, purpose, objectId: objectId || order.orderId, assignedStaffId: order.assignedStaffId, state: order.status, action, ...(dataClass ? { dataClass } : {}), ...(fresh ? { freshSeconds: 300 } : {}), newWork }, now());
    return { kind: "staff", staffId: staff.staffId };
  }
  async function operation(tx, claims, input, action, target, actor) {
    const path = ref(`transactionOperations/${identifier(input.operationId)}`);
    const fingerprint = keyed(JSON.stringify({ uid: claims.uid, action, target, input })), prior = (await tx.get(path)).data();
    if (prior && (prior.actorUid !== claims.uid || prior.fingerprint !== fingerprint)) fail("operation-conflict", 409);
    return { prior, commit(result) {
      tx.create(path, { actorUid: claims.uid, actor, action, target, fingerprint, state: "committed", result, createdAt: now() });
      tx.create(ref(`transactionEvidence/${input.operationId}`), { actor, executor: "system:transaction-api", action, target, createdAt: now(), result });
      account.capture(tx, { domain: "transaction", operationId: input.operationId, action, target, actor, executor: "system:transaction-api" });
      return { state: "committed", ...result };
    } };
  }
  function current(order, work, input) {
    if (!work || work.componentId !== (input.componentId || "base") || order.version !== input.expectedVersion || work.currentEdition !== input.expectedEdition) fail("stale-conflict", 409);
  }
  const emptyWork = componentId => ({ componentId, version: 1, currentEdition: 0, workingVersion: 0, working: null, businessApproval: null, customerApproval: null, paymentEnabled: null, fulfilment: "NOT STARTED", delivery: "NOT PREPARED", deliveryContextVersion: 0, deliveryContext: null, completed: false, cancelled: false, issues: {} });
  const mainOrderOwner = {
    async prepare(tx, { logicalId, source, actor }) {
      const orderId = logicalId, path = orderRef(orderId), prior = (await tx.get(path)).data();
      const profile = (await tx.get(ref(`customerProfiles/${source.accountId}`))).data();
      const mediaReferences = [];
      for (const sourceReferenceId of source.mediaRefs || []) {
        const sourceReference = (await tx.get(ref(`mediaReferences/${identifier(sourceReferenceId)}`))).data();
        const asset = sourceReference ? (await tx.get(ref(`mediaAssets/${sourceReference.assetId}`))).data() : null;
        if (!sourceReference?.active || sourceReference.domain !== "custom-style" || sourceReference.objectId !== source.requestId || !asset || asset.purgeState) fail();
        mediaReferences.push({ referenceId: keyed(`order-origin:${orderId}:${sourceReferenceId}`), assetId: asset.assetId, sourceReferenceId });
      }
      if (prior && (prior.sourceRequestId !== source.requestId || prior.accountId !== source.accountId)) fail();
      return { orderId, commit() {
        if (prior) return;
        const snapshot = { sourceRequestId: source.requestId, sourceVersion: source.version, productOrigin: source.source, request: source.fields, mediaRefs: mediaReferences.map(value => value.referenceId), customer: { accountId: source.accountId, fullName: profile?.fields?.fullName || "", phoneNumber: profile?.fields?.phoneNumber || "" }, capturedAt: now() };
        for (const reference of mediaReferences) tx.create(ref(`mediaReferences/${reference.referenceId}`), { ...reference, domain: "order-origin", objectId: orderId, active: true, protected: true, capturedAt: now() });
        tx.create(path, { _ownerVersion: 3, orderId, accountId: source.accountId, sourceRequestId: source.requestId, version: 1, status: "OPEN", currentWork: "base", activeExtensionId: null, assignedStaffId: null, originalSnapshot: snapshot, chatId: chatIdFor(orderId), reviewEnabled: false, createdAt: now() });
        tx.create(workRef(orderId), emptyWork("base"));
        tx.create(ref(`accountConversations/${chatIdFor(orderId)}`), { _ownerVersion: 3, chatId: chatIdFor(orderId), kind: "transaction", orderId, accountId: source.accountId, sequence: 0, createdAt: now(), originalActor: actor });
      } };
    },
    async exists(orderId) { return (await orderRef(orderId).get()).data()?._ownerVersion === 3; },
  };
  async function catalogueOrder(claims,input){
    exactFields(input,["operationId","items","deliveryAddress"]);if(isStaff(claims)||!Array.isArray(input.items)||!input.items.length||input.items.length>50)fail("invalid-argument",400);
    return db.runTransaction(async tx=>{
      const owner=await customer(tx,claims),orderId=keyed(`catalogue-order:${owner.accountId}:${identifier(input.operationId)}`),actor={kind:"customer",accountId:owner.accountId};
      const op=await operation(tx,claims,input,"order.catalogue-create",orderId,actor);if(op.prior)return{state:"committed",...op.prior.result};
      const profile=(await tx.get(ref(`customerProfiles/${owner.accountId}`))).data(),entries=[],captured=[];
      for(let index=0;index<input.items.length;index++){
        const item=input.items[index];exactFields(item,["productId","quantity","selections","expectedPublicVersion"]);
        if(!Number.isSafeInteger(item.quantity)||item.quantity<1)fail("invalid-argument",400);
        const raw=(await tx.get(ref(`products/${identifier(item.productId)}`))).data(),product=publicProduct(item.productId,raw);
        if(!product||product.publicVersion!==item.expectedPublicVersion)fail("product-state-changed",409);
        const options=resolveSelections(product,item.selections||{});if(!options.isComplete)fail("selection-required",409);
        const unitAmountMinor=money(Math.round(product.price*100));
        const entry={rootId:keyed(`entry:${orderId}:${index}`),productId:product.id,label:product.name,quantity:item.quantity,unitAmountMinor,options:options.resolved};entries.push(entry);captured.push({...entry,publicVersion:product.publicVersion,unitLabel:product.unitLabel});
      }
      let delivery=null;
      if(input.deliveryAddress){
        exactFields(input.deliveryAddress,["addressId","expectedVersion"]);
        const book=(await tx.get(ref(`accountAddressBooks/${owner.accountId}`))).data(),address=(await tx.get(ref(`accountAddressBooks/${owner.accountId}/addresses/${identifier(input.deliveryAddress.addressId)}`))).data();
        if(!book||book.accountId!==owner.accountId||!address||address.accountId!==owner.accountId||address.epoch!==book.epoch||address.version!==input.deliveryAddress.expectedVersion)fail("address-state-changed",409);
        delivery=clone(address.fields);
      }
      const totalMinor=money(entries.reduce((sum,entry)=>sum+entry.quantity*entry.unitAmountMinor,0));
      tx.create(orderRef(orderId),{_ownerVersion:3,orderId,accountId:owner.accountId,sourceType:"catalogue",sourceRequestId:null,version:1,status:"OPEN",currentWork:"base",activeExtensionId:null,assignedStaffId:null,originalSnapshot:{items:captured,customer:{accountId:owner.accountId,fullName:profile?.fields?.fullName||"",phoneNumber:profile?.fields?.phoneNumber||""},delivery,capturedAt:now()},chatId:chatIdFor(orderId),reviewEnabled:false,createdAt:now()});
      tx.create(workRef(orderId),{...emptyWork("base"),working:{entries,totalMinor,amountDueNowMinor:totalMinor,currency:"NGN",notes:""},workingVersion:1});
      for(const entry of entries)tx.create(workRef(orderId).collection("entryRoots").doc(entry.rootId),{rootId:entry.rootId,orderId,componentId:"base",createdBy:actor,createdAt:now()});
      tx.create(ref(`accountConversations/${chatIdFor(orderId)}`),{_ownerVersion:3,chatId:chatIdFor(orderId),kind:"transaction",orderId,accountId:owner.accountId,sequence:0,createdAt:now(),originalActor:actor});
      return op.commit({orderId,version:1});
    });
  }
  function terms(input, rootPrefix = "entry") {
    exactFields(input, ["entries", "amountDueNowMinor", "notes"]);
    if (!Array.isArray(input.entries) || !input.entries.length || input.entries.length > 50) fail("invalid-argument", 400);
    const entries = input.entries.map((entry, index) => {
      exactFields(entry, ["rootId", "label", "quantity", "unitAmountMinor", "productId", "options"]);
      if (typeof entry.label !== "string" || !entry.label.trim() || !Number.isSafeInteger(entry.quantity) || entry.quantity < 1) fail("invalid-argument", 400);
      const rootId = entry.rootId ? identifier(entry.rootId) : `${rootPrefix}-${index + 1}`;
      return { rootId, label: entry.label.trim(), quantity: entry.quantity, unitAmountMinor: money(entry.unitAmountMinor), ...(entry.productId ? { productId: identifier(entry.productId) } : {}), options: entry.options || {} };
    });
    if (new Set(entries.map(entry => entry.rootId)).size !== entries.length) fail("invalid-argument", 400);
    const totalMinor = money(entries.reduce((sum, entry) => sum + entry.quantity * entry.unitAmountMinor, 0));
    const dueNowMinor = money(input.amountDueNowMinor);
    if (dueNowMinor > totalMinor || input.notes != null && typeof input.notes !== "string") fail("invalid-argument", 400);
    return { entries, totalMinor, amountDueNowMinor: dueNowMinor, currency: "NGN", notes: input.notes || "" };
  }
  async function readOrder(claims, orderId, componentId = "base") {
    return db.runTransaction(async tx => {
      const order = (await tx.get(orderRef(orderId))).data(); await authority(tx, claims, order, "read");
      const work = (await tx.get(workRef(orderId, componentId))).data(); if (!work || work.componentId !== componentId || order.orderId !== orderId) fail();
      const edition = work.currentEdition ? (await tx.get(workRef(orderId, componentId).collection("editions").doc(String(work.currentEdition)))).data() : null;
      const ledger = await financial(tx, orderId, componentId);
      return { orderId, version: order.version, componentId, status: order.status, currentWork: order.currentWork, currentEdition: work.currentEdition, edition, businessApproval: work.businessApproval, customerApproval: work.customerApproval, paymentEnabled: work.paymentEnabled, assignedStaffId: order.assignedStaffId, fulfilment: work.fulfilment, delivery: work.delivery, completed: work.completed, cancelled: work.cancelled, reviewEnabled: order.reviewEnabled, chatId: order.chatId, ...ledger };
    });
  }
  async function listOrders(claims) {
    return db.runTransaction(async tx => {
      const owner = await customer(tx, claims), rows = await tx.get(db.collection("orders").where("accountId", "==", owner.accountId).limit(100));
      return { records: rows.docs.filter(row => row.data()._ownerVersion === 3).map(row => ({ orderId: row.id, version: row.data().version, status: row.data().status, currentWork: row.data().currentWork, chatId: row.data().chatId })) };
    });
  }
  async function historicalEdition(claims,orderId,componentId,number){
    if(!Number.isSafeInteger(number)||number<1)fail("invalid-argument",400);
    return db.runTransaction(async tx=>{
      const order=(await tx.get(orderRef(orderId))).data();await authority(tx,claims,order,"read");
      const work=(await tx.get(workRef(orderId,componentId))).data(),edition=(await tx.get(workRef(orderId,componentId).collection("editions").doc(String(number)))).data();
      if(!work||!edition||edition.number!==number||number>work.currentEdition)fail();return{orderId,componentId,viewedEdition:number,currentEdition:work.currentEdition,edition};
    });
  }
  async function commercial(claims, input) {
    exactFields(input, ["operationId", "orderId", "componentId", "expectedVersion", "expectedEdition", "expectedWorkingVersion", "action", "terms"]);
    const action = input.action, componentId = input.componentId || "base";
    if (!["save-working", "save-amendment-working", "undo-working", "establish-edition", "establish-amendment", "business-approve", "customer-approve", "enable-payment"].includes(action)) fail("invalid-argument", 400);
    if (action !== "customer-approve" && !isStaff(claims) || action === "customer-approve" && isStaff(claims)) fail();
    return db.runTransaction(async tx => {
      const path = orderRef(input.orderId), order = (await tx.get(path)).data(), workPath = workRef(input.orderId, componentId), work = (await tx.get(workPath)).data();
      const actor = await authority(tx, claims, order, action, { fresh: ["customer-approve", "enable-payment"].includes(action) });
      const op = await operation(tx, claims, input, `commercial.${action}`, input.orderId + ":" + componentId, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      current(order, work, input); if (work.cancelled || work.completed || componentId !== "base" && order.activeExtensionId !== componentId) fail("work-ineligible", 409);
      const update = {};
      if (["save-working", "save-amendment-working", "undo-working", "establish-edition", "establish-amendment"].includes(action)) {
        const amendment = ["save-amendment-working", "establish-amendment"].includes(action);
        if ((work.paymentEnabled && !amendment && action !== "undo-working") || work.workingVersion !== input.expectedWorkingVersion) fail("commercial-lock-or-conflict", 409);
        if (amendment && (!work.paymentEnabled && !work.workingAmendment || ["DISPATCHED", "DELIVERED"].includes(work.delivery))) fail("amendment-ineligible", 409);
        if (["save-working", "save-amendment-working"].includes(action)) {
          update.working = terms(input.terms, keyed(`${order.orderId}:${componentId}:${input.operationId}`).slice(0, 32)); update.workingVersion = work.workingVersion + 1;
          if (amendment) {
            const established = (await tx.get(workPath.collection("editions").doc(String(work.currentEdition)))).data();
            if (!established || update.working.totalMinor !== established.totalMinor || update.working.amountDueNowMinor !== established.amountDueNowMinor || update.working.entries.length !== established.entries.length || update.working.entries.some(entry => !established.entries.some(old => old.rootId === entry.rootId && old.quantity === entry.quantity && old.unitAmountMinor === entry.unitAmountMinor && old.productId === entry.productId))) fail("new-payable-work-requires-extension", 409);
            update.workingAmendment = true;
          } else update.workingAmendment = false;
          const roots = [];
          for (const entry of update.working.entries) {
            const rootPath = workPath.collection("entryRoots").doc(entry.rootId), root = (await tx.get(rootPath)).data();
            const provided = input.terms.entries.some(raw => raw.rootId === entry.rootId);
            if (provided && !root && !work.working?.entries.some(old => old.rootId === entry.rootId)) fail("entry-lineage-conflict", 409);
            if (!root) roots.push({ path: rootPath, value: { rootId: entry.rootId, orderId: order.orderId, componentId, createdBy: actor, createdAt: now() } });
          }
          for (const root of roots) tx.create(root.path, root.value);
        }
        if (action === "undo-working") { update.working = null; update.workingAmendment = false; update.workingVersion = work.workingVersion + 1; }
        if (["establish-edition", "establish-amendment"].includes(action)) {
          if (!work.working) fail("working-change-required", 409);
          if (Boolean(work.workingAmendment) !== amendment) fail("amendment-route-required", 409);
          const number = work.currentEdition + 1;
          tx.create(workPath.collection("editions").doc(String(number)), { ...work.working, number, amendment, establishedBy: actor, establishedAt: now() });
          for (const entry of work.working.entries) tx.create(workPath.collection("entryVersions").doc(`${entry.rootId}:${number}`), { ...entry, edition: number });
          Object.assign(update, { currentEdition: number, working: null, workingAmendment: false, workingVersion: work.workingVersion + 1, businessApproval: null, customerApproval: null, paymentEnabled: null });
        }
      } else {
        if (!work.currentEdition || work.working) fail("approval-ineligible", 409);
        if (action === "business-approve") update.businessApproval = { edition: work.currentEdition, actor, at: now() };
        if (action === "customer-approve") { if (work.businessApproval?.edition !== work.currentEdition) fail("business-approval-required", 409); update.customerApproval = { edition: work.currentEdition, actor, at: now() }; }
        if (action === "enable-payment") { if (work.businessApproval?.edition !== work.currentEdition || work.customerApproval?.edition !== work.currentEdition) fail("approval-required", 409); update.paymentEnabled = { edition: work.currentEdition, actor, at: now() }; }
      }
      tx.update(workPath, { ...update, version: work.version + 1 }); tx.update(path, { version: order.version + 1 });
      return op.commit({ orderId: order.orderId, componentId, version: order.version + 1, edition: update.currentEdition || work.currentEdition, workingVersion: update.workingVersion ?? work.workingVersion });
    });
  }
  async function financial(tx, orderId, componentId) {
    const work = (await tx.get(workRef(orderId, componentId))).data();
    const edition = work?.currentEdition ? (await tx.get(workRef(orderId, componentId).collection("editions").doc(String(work.currentEdition)))).data() : null;
    const rows = await tx.get(db.collection("payments").where("orderId", "==", orderId).where("componentId", "==", componentId).where("state", "==", "VERIFIED"));
    let totalPaidMinor = 0; const seen = new Set();
    for (const row of rows.docs) {
      const payment = row.data();
      if (!payment.verifiedDecisionId) fail("financial-source-unavailable", 503);
      const decision = (await tx.get(ref(`paymentDecisions/${payment.verifiedDecisionId}`))).data();
      if (!decision || decision.paymentId !== row.id || decision.decision !== "VERIFIED" || decision.proofReferenceId !== payment.proofReferenceId || decision.verifiedAmountMinor !== payment.verifiedAmountMinor) fail("financial-source-unavailable", 503);
      if (seen.has(payment.contributionId)) continue;
      seen.add(payment.contributionId); totalPaidMinor = money(totalPaidMinor + payment.verifiedAmountMinor);
    }
    return { totalPaidMinor, outstandingMinor: edition ? Math.max(0, edition.totalMinor - totalPaidMinor) : null, amountDueNowMinor: edition ? Math.max(0, edition.amountDueNowMinor - totalPaidMinor) : null };
  }
  async function paymentIntent(claims, input) {
    exactFields(input, ["operationId", "orderId", "componentId", "expectedVersion", "expectedEdition", "amountMinor", "correctsPaymentId"]);
    if (isStaff(claims) || money(input.amountMinor) === 0) fail();
    return db.runTransaction(async tx => {
      const order = (await tx.get(orderRef(input.orderId))).data(), componentId = input.componentId || "base", work = (await tx.get(workRef(input.orderId, componentId))).data();
      const actor = await authority(tx, claims, order, "pay");
      const op = await operation(tx, claims, input, "payment.intent", input.orderId, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      current(order, work, input); if (work.paymentEnabled?.edition !== work.currentEdition || work.cancelled || componentId !== "base" && order.activeExtensionId !== componentId) fail("payment-not-enabled", 409);
      let contributionId = keyed(`payment:${claims.uid}:${input.operationId}`), corrects = null;
      if (input.correctsPaymentId) { corrects = (await tx.get(ref(`payments/${identifier(input.correctsPaymentId)}`))).data(); if (!corrects || corrects.orderId !== input.orderId || corrects.componentId !== componentId || corrects.state !== "NEEDS ATTENTION" || corrects.supersededBy) fail(); contributionId = corrects.contributionId; }
      const paymentId = keyed(`submission:${claims.uid}:${input.operationId}`);
      const bankInstruction = await configuration.effective(tx, "bank-transfer");
      tx.create(ref(`paymentIntents/${paymentId}`), { paymentId, accountId: order.accountId, orderId: order.orderId, componentId, edition: work.currentEdition, amountMinor: input.amountMinor, contributionId, correctsPaymentId: corrects?.paymentId || null, bankInstruction, version: 1, actor, createdAt: now() });
      return op.commit({ paymentId, version: 1, bankInstruction });
    });
  }
  async function paymentSubmit(claims, input) {
    exactFields(input, ["operationId", "paymentId", "assetId"]); if (isStaff(claims)) fail();
    return db.runTransaction(async tx => {
      const intent = (await tx.get(ref(`paymentIntents/${identifier(input.paymentId)}`))).data(); if (!intent) fail();
      const order = (await tx.get(orderRef(intent.orderId))).data(), actor = await authority(tx, claims, order, "pay");
      if(intent.actor?.epoch!==actor.epoch)fail("stale-authority",409);
      const op = await operation(tx, claims, input, "payment.submit", intent.paymentId, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      const work = (await tx.get(workRef(intent.orderId, intent.componentId))).data(), prior = (await tx.get(ref(`payments/${intent.paymentId}`))).data();
      const asset = (await tx.get(ref(`mediaAssets/${identifier(input.assetId)}`))).data();
      const corrected = intent.correctsPaymentId ? (await tx.get(ref(`payments/${intent.correctsPaymentId}`))).data() : null;
      if (prior || !work || work.cancelled || work.paymentEnabled?.edition !== intent.edition || work.currentEdition !== intent.edition || intent.componentId !== "base" && order.activeExtensionId !== intent.componentId) fail("payment-ineligible", 409);
      if (!asset || asset.domain !== "payment-proof" || asset.objectId !== intent.paymentId || asset.actorUid !== claims.uid || asset.expectedEpoch !== actor.epoch || asset.state !== "validated" || asset.purgeState) fail();
      if (corrected && (corrected.state !== "NEEDS ATTENTION" || corrected.supersededBy)) fail("stale-conflict", 409);
      const referenceId = keyed(`proof:${intent.paymentId}`);
      tx.create(ref(`mediaReferences/${referenceId}`), { referenceId, assetId: asset.assetId, domain: "payment-proof", objectId: intent.paymentId, active: true, protected: true, createdAt: now() }); tx.update(ref(`mediaAssets/${asset.assetId}`), { everAttached: true });
      tx.create(ref(`payments/${intent.paymentId}`), { ...intent, proofReferenceId: referenceId, state: "RECEIPT SUBMITTED", version: 1, submittedAt: now() });
      if (corrected) tx.update(ref(`payments/${corrected.paymentId}`), { supersededBy: intent.paymentId, version: corrected.version + 1 });
      tx.update(orderRef(order.orderId), { version: order.version + 1 });
      return op.commit({ paymentId: intent.paymentId, version: 1 });
    });
  }
  async function paymentReview(claims, input) {
    exactFields(input, ["operationId", "paymentId", "expectedVersion", "decision", "reason", "verifiedAmountMinor", "bankTransferReference"]);
    if (!isStaff(claims) || !["UNDER REVIEW", "VERIFIED", "NEEDS ATTENTION"].includes(input.decision) || typeof input.reason !== "string" || !input.reason.trim()) fail();
    return db.runTransaction(async tx => {
      const path = ref(`payments/${identifier(input.paymentId)}`), payment = (await tx.get(path)).data(); if (!payment) fail();
      const order = (await tx.get(orderRef(payment.orderId))).data(), actor = await authority(tx, claims, order, "verify", { domain: "payments", purpose: "payment-evidence", dataClass: "payment-proof", objectId: payment.paymentId, fresh: true });
      const op = await operation(tx, claims, input, "payment.review", payment.paymentId, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      const contributionRef = ref(`paymentContributions/${payment.contributionId}`), contribution = (await tx.get(contributionRef)).data();
      let bankEffectRef = null, bankEffect = null;
      if (input.decision === "VERIFIED") {
        if (typeof input.bankTransferReference !== "string" || !input.bankTransferReference.trim() || money(input.verifiedAmountMinor) === 0) fail("verification-evidence-required", 409);
        bankEffectRef = ref(`bankTransferEffects/${keyed(input.bankTransferReference.trim())}`); bankEffect = (await tx.get(bankEffectRef)).data();
      }
      const proof = (await tx.get(ref(`mediaReferences/${payment.proofReferenceId}`))).data();
      if (payment.version !== input.expectedVersion || payment.state === "VERIFIED" || payment.supersededBy || !proof || proof.objectId !== payment.paymentId) fail("stale-conflict", 409);
      if (input.decision === "VERIFIED") { if (contribution || bankEffect) fail("duplicate-financial-effect", 409); tx.create(contributionRef, { orderId: payment.orderId, componentId: payment.componentId, paymentId: payment.paymentId, amountMinor: input.verifiedAmountMinor, decisionId: input.operationId }); tx.create(bankEffectRef, { paymentId: payment.paymentId, decisionId: input.operationId }); }
      tx.create(ref(`paymentDecisions/${input.operationId}`), { paymentId: payment.paymentId, proofReferenceId: payment.proofReferenceId, decision: input.decision, reason: input.reason, actor, at: now(), ...(input.decision === "VERIFIED" ? { verifiedAmountMinor: input.verifiedAmountMinor } : {}) });
      tx.update(path, { state: input.decision, version: payment.version + 1, ...(input.decision === "VERIFIED" ? { verifiedAmountMinor: input.verifiedAmountMinor, verifiedDecisionId: input.operationId } : {}) }); tx.update(orderRef(order.orderId), { version: order.version + 1 });
      return op.commit({ paymentId: payment.paymentId, version: payment.version + 1, paymentState: input.decision });
    });
  }
  async function extension(claims, input) {
    exactFields(input, ["operationId", "orderId", "extensionId", "expectedVersion", "expectedRevision", "action", "terms", "reason"]);
    if (!["propose", "revise", "accept", "activate", "decline", "close"].includes(input.action)) fail("invalid-argument", 400);
    if (["accept", "decline"].includes(input.action) ? isStaff(claims) : !isStaff(claims)) fail();
    return db.runTransaction(async tx => {
      const path = orderRef(input.orderId), order = (await tx.get(path)).data(), actor = await authority(tx, claims, order, `extension-${input.action}`);
      const op = await operation(tx, claims, input, `extension.${input.action}`, input.orderId, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      if (order.version !== input.expectedVersion || order.status === "CANCELLED") fail("stale-conflict", 409);
      const extensionId = input.action === "propose" ? keyed(`extension:${input.orderId}:${input.operationId}`) : identifier(input.extensionId), extensionPath = ref(`orders/${input.orderId}/extensions/${extensionId}`), prior = (await tx.get(extensionPath)).data();
      const base = (await tx.get(workRef(input.orderId))).data();
      const reviews = input.action === "activate" ? await publicReviews(tx,input.orderId) : null;
      if (["propose", "activate"].includes(input.action) && !base?.paymentEnabled && !base?.completed) fail("base-not-commercially-locked", 409);
      if (input.action !== "propose" && (!prior || prior.revision !== input.expectedRevision || prior.state.startsWith("DORMANT"))) fail("stale-conflict", 409);
      let next = { ...prior, extensionId, revision: prior?.revision || 0 }, currentWork = order.currentWork, activeExtensionId = order.activeExtensionId;
      if (["propose", "revise"].includes(input.action)) {
        if (prior?.state === "ACTIVE") fail("active-extension-locked", 409);
        const proposal = terms(input.terms, keyed(`extension-entries:${extensionId}`).slice(0, 32)); next = { ...next, revision: next.revision + 1, terms: proposal, state: "PROPOSED", acceptedRevision: null };
        tx.create(extensionPath.collection("proposals").doc(String(next.revision)), { ...proposal, revision: next.revision, actor, at: now() });
      }
      if (input.action === "accept") { next.acceptedRevision = next.revision; next.acceptedBy = actor; }
      if (input.action === "activate") {
        if (order.activeExtensionId || prior.acceptedRevision !== prior.revision) fail("active-extension-or-acceptance-conflict", 409);
        activeExtensionId = extensionId; currentWork = extensionId; next.state = "ACTIVE";
        tx.create(workRef(input.orderId, extensionId), { ...emptyWork(extensionId), working: prior.terms, workingVersion: 1 });
      }
      if (["decline", "close"].includes(input.action)) {
        if (prior.state === "ACTIVE") fail("active-work-requires-terminal-owner", 409);
        next.state = input.action === "decline" ? "DORMANT — DECLINED" : "DORMANT — FORMALLY CLOSED";
      }
      tx.set(extensionPath, next); tx.update(path, { version: order.version + 1, currentWork, activeExtensionId });
      if(reviews)publicSignals(tx,reviews,false);
      return op.commit({ orderId: order.orderId, extensionId, revision: next.revision, version: order.version + 1, extensionState: next.state });
    });
  }
  async function operational(claims, input) {
    exactFields(input, ["operationId", "orderId", "componentId", "expectedVersion", "expectedEdition", "action", "targetStaffId", "expectedDeliveryVersion", "deliveryContext", "reason", "issueId", "issueKind", "sourceCondition", "resolved", "fulfilmentComponentId", "label", "completed", "providerEventId", "providerSequence", "providerState"]);
    const allowed = ["claim", "transfer", "remove-assignment", "start-fulfilment", "fulfilment-component", "work-complete", "delivery-preparation", "delivery-context", "ready-dispatch", "dispatch", "record-provider-event", "reconcile-delivery", "complete", "completion-correction", "request-cancellation", "cancel", "issue", "enable-review"];
    if (!allowed.includes(input.action) || input.action !== "request-cancellation" && !isStaff(claims)) fail();
    return db.runTransaction(async tx => {
      const path = orderRef(input.orderId), order = (await tx.get(path)).data(), workPath = workRef(input.orderId, input.componentId || "base"), work = (await tx.get(workPath)).data();
      const actor = await authority(tx, claims, order, input.action, { fresh: ["dispatch", "complete", "cancel", "completion-correction"].includes(input.action), newWork: input.action === "claim" });
      const op = await operation(tx, claims, input, `operations.${input.action}`, input.orderId, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      current(order, work, input); const orderUpdate = { version: order.version + 1 }, workUpdate = { version: work.version + 1 };
      const privacyTransition = ["complete","completion-correction","cancel","enable-review"].includes(input.action);
      const linkedReviews = privacyTransition ? await publicReviews(tx,order.orderId) : null;
      const baseForPrivacy = privacyTransition && work.componentId!=="base" ? (await tx.get(workRef(order.orderId))).data() : work;
      if (work.componentId !== "base" && order.activeExtensionId !== work.componentId) fail("inactive-work", 409);
      const terminalAllowed = ["completion-correction", "enable-review", "claim", "transfer", "remove-assignment"];
      if ((work.completed || work.cancelled) && !terminalAllowed.includes(input.action)) fail("terminal-work", 409);
      if (input.action === "claim") {
        if (order.assignedStaffId || work.completed || work.cancelled || order.currentWork!==work.componentId) fail("already-assigned-or-unclaimable", 409);
        const staff = await resolveStaff(tx, db, claims, { capability: "orders.claim", purpose: "order-operations", objectId: order.orderId, state: order.status, action: "claim", couturier: true, newWork: true }, now()); orderUpdate.assignedStaffId = staff.staffId;
      }
      if (input.action === "transfer") {
        const target = (await tx.get(ref(`staffIdentities/${identifier(input.targetStaffId)}`))).data();
        const member = target ? (await tx.get(ref(`admins/${target.principalUid}`))).data() : null;
        if (!order.assignedStaffId || !target?.active || !member?.active || member.sharedAccount || member.staffId !== target.staffId || !member.functionAsCouturier || !member.eligible || !member.available) fail();
        orderUpdate.assignedStaffId = target.staffId;
      }
      if (input.action === "remove-assignment") orderUpdate.assignedStaffId = null;
      const blocked = Object.values(work.issues || {}).some(issue => !issue.resolved && ["BLOCKER", "HOLD"].includes(issue.kind));
      if (["work-complete", "delivery-preparation", "ready-dispatch", "dispatch", "complete"].includes(input.action) && (work.businessApproval?.edition !== work.currentEdition || work.customerApproval?.edition !== work.currentEdition || work.paymentEnabled?.edition !== work.currentEdition)) fail("current-commercial-approval-required", 409);
      if (["start-fulfilment", "ready-dispatch", "dispatch", "complete"].includes(input.action) && blocked) fail("work-blocked", 409);
      if (input.action === "start-fulfilment") { const ledger = await financial(tx, order.orderId, work.componentId); if (!work.currentEdition || work.customerApproval?.edition !== work.currentEdition || !work.paymentEnabled || ledger.amountDueNowMinor !== 0 || !order.assignedStaffId || work.fulfilment !== "NOT STARTED") fail("fulfilment-not-ready", 409); workUpdate.fulfilment = "IN FULFILMENT"; }
      if (input.action === "fulfilment-component") { if (work.fulfilment !== "IN FULFILMENT" || typeof input.label !== "string" || typeof input.completed !== "boolean") fail("invalid-argument", 400); workUpdate.fulfilmentComponents = { ...work.fulfilmentComponents, [identifier(input.fulfilmentComponentId)]: { label: input.label, complete: input.completed, actor, at: now() } }; }
      if (input.action === "work-complete") { if (work.fulfilment !== "IN FULFILMENT" || blocked || Object.values(work.fulfilmentComponents || {}).some(component => !component.complete)) fail("work-incomplete", 409); workUpdate.workComplete = true; }
      if (input.action === "delivery-preparation") { if (work.fulfilment !== "IN FULFILMENT" || !work.workComplete) fail("fulfilment-required", 409); workUpdate.fulfilment = "READY FOR DELIVERY PREPARATION"; }
      if (input.action === "delivery-context") {
        if (["DISPATCHED", "DELIVERED"].includes(work.delivery) || work.deliveryContextVersion !== input.expectedDeliveryVersion) fail("stale-delivery-context", 409);
        exactFields(input.deliveryContext, ["recipientName", "phoneNumber", "address", "provider", "route"]);
        if (typeof input.deliveryContext.address !== "string" || !input.deliveryContext.address.trim()) fail("invalid-argument", 400);
        workUpdate.deliveryContext = clone(input.deliveryContext); workUpdate.deliveryContextVersion = work.deliveryContextVersion + 1;
      }
      if (input.action === "ready-dispatch") { if (work.fulfilment !== "READY FOR DELIVERY PREPARATION" || !work.deliveryContext) fail("delivery-not-ready", 409); workUpdate.delivery = "READY FOR DISPATCH"; }
      if (input.action === "dispatch") {
        if (work.delivery !== "READY FOR DISPATCH" || work.deliveryContextVersion !== input.expectedDeliveryVersion || order.currentWork !== work.componentId) fail("dispatch-conflict", 409);
        workUpdate.delivery = "DISPATCHED"; workUpdate.dispatchId = input.operationId;
        tx.create(ref(`dispatchSnapshots/${input.operationId}`), { orderId: order.orderId, componentId: work.componentId, edition: work.currentEdition, deliveryContextVersion: work.deliveryContextVersion, context: work.deliveryContext, actor, at: now() });
      }
      if (input.action === "record-provider-event") {
        if (!work.dispatchId || !Number.isSafeInteger(input.providerSequence) || !["IN PROGRESS", "DELIVERED"].includes(input.providerState)) fail("invalid-provider-evidence", 409);
        tx.create(ref(`deliveryProviderEvidence/${identifier(input.providerEventId)}`), { orderId: order.orderId, componentId: work.componentId, dispatchId: work.dispatchId, sequence: input.providerSequence, state: input.providerState, recordedBy: actor, at: now() });
      }
      if (input.action === "reconcile-delivery") {
        const event = (await tx.get(ref(`deliveryProviderEvidence/${identifier(input.providerEventId)}`))).data();
        if (!event || event.orderId !== order.orderId || event.componentId !== work.componentId || event.dispatchId !== work.dispatchId) fail();
        if (event.sequence > (work.providerSequence || -1)) workUpdate.providerSequence = event.sequence;
        if (event.state === "DELIVERED" && work.delivery === "DISPATCHED") workUpdate.delivery = "DELIVERED";
        // Lower/late evidence never regresses terminal Delivered.
      }
      if (input.action === "complete") {
        const ledger = await financial(tx, order.orderId, work.componentId);
        if (work.delivery !== "DELIVERED" || ledger.outstandingMinor !== 0 || order.currentWork !== work.componentId || !order.assignedStaffId) fail("completion-ineligible", 409);
        workUpdate.completed = true; workUpdate.completionId = input.operationId;
        if (work.componentId === "base") orderUpdate.status = "COMPLETED";
      }
      if (input.action === "completion-correction") { if (!work.completed || order.activeExtensionId || typeof input.reason !== "string" || !input.reason.trim()) fail("correction-ineligible", 409); workUpdate.completed = false; workUpdate.completionCorrectionId = input.operationId; orderUpdate.reviewEnabled = false; if (work.componentId === "base") orderUpdate.status = "OPEN"; }
      if (input.action === "request-cancellation") workUpdate.cancellationRequested = { actor, at: now(), reason: input.reason || "" };
      if (input.action === "cancel") { if (!work.cancellationRequested || work.delivery === "DELIVERED" || work.completed || typeof input.reason !== "string" || !input.reason.trim()) fail("cancellation-ineligible", 409); workUpdate.cancelled = true; if (work.componentId === "base") orderUpdate.status = "CANCELLED"; }
      if (input.action === "issue") {
        if (!["BLOCKER", "HOLD", "DELAY"].includes(input.issueKind) || typeof input.reason !== "string" || typeof input.resolved !== "boolean") fail("invalid-argument", 400);
        const previous = work.issues?.[input.issueId]; if (previous && previous.kind !== input.issueKind) fail("issue-type-conflict", 409);
        if (input.resolved && input.issueKind === "BLOCKER") {
          let resolved = false;
          if (previous?.sourceCondition === "payment") resolved = (await financial(tx, order.orderId, work.componentId)).amountDueNowMinor === 0;
          if (previous?.sourceCondition === "approval") resolved = work.customerApproval?.edition === work.currentEdition;
          if (!resolved) fail("source-condition-unresolved", 409);
        }
        workUpdate.issues = { ...work.issues, [identifier(input.issueId)]: { kind: input.issueKind, sourceCondition: previous?.sourceCondition || input.sourceCondition || null, reason: input.reason, resolved: input.resolved, actor, at: now() } };
      }
      if (input.action === "enable-review") { const base = (await tx.get(workRef(order.orderId))).data(); if (!base?.completed || order.activeExtensionId) fail("review-ineligible", 409); orderUpdate.reviewEnabled = true; }
      if (work.componentId !== "base" && (workUpdate.completed || workUpdate.cancelled)) { tx.update(ref(`orders/${order.orderId}/extensions/${work.componentId}`), { state: workUpdate.completed ? "DORMANT — COMPLETED" : "DORMANT — CANCELLED" }); orderUpdate.activeExtensionId = null; orderUpdate.currentWork = "base"; }
      if(linkedReviews)publicSignals(tx,linkedReviews,(work.componentId==="base"?(workUpdate.completed??work.completed):baseForPrivacy.completed)&&(orderUpdate.reviewEnabled??order.reviewEnabled)&&!(Object.hasOwn(orderUpdate,"activeExtensionId")?orderUpdate.activeExtensionId:order.activeExtensionId));
      tx.create(ref(`orderOperationalHistory/${input.operationId}`), { orderId: order.orderId, componentId: work.componentId, edition: work.currentEdition, action: input.action, actor, at: now(), previousAssignee: order.assignedStaffId, previousCompletionId: work.completionId || null, details: Object.fromEntries(["issueId", "issueKind", "sourceCondition", "resolved", "reason", "targetStaffId", "providerEventId", "fulfilmentComponentId", "completed"].filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]])) });
      tx.update(workPath, workUpdate); tx.update(path, orderUpdate);
      return op.commit({ orderId: order.orderId, componentId: work.componentId, version: order.version + 1, action: input.action });
    });
  }
  async function mediaContext(tx, claims, input, action) {
    if (input.domain === "order-origin") {
      if (action !== "read") fail("historical-reference-read-only", 409);
      const path = orderRef(input.objectId), order = (await tx.get(path)).data(), actor = await authority(tx, claims, order, "origin-read", { dataClass: isStaff(claims) ? "order-origin" : null });
      return { ownerRef: path, owner: order, version: order.version, identity: actor };
    }
    if (input.domain !== "payment-proof") return null;
    const payment = (await tx.get(ref(`payments/${identifier(input.objectId)}`))).data() || (await tx.get(ref(`paymentIntents/${input.objectId}`))).data(); if (!payment) fail();
    const order = (await tx.get(orderRef(payment.orderId))).data();
    if (payment.paymentId !== input.objectId || payment.accountId !== order?.accountId) fail();
    const actor = await authority(tx, claims, order, action === "read" ? "proof-read" : "pay", { domain: isStaff(claims) ? "payments" : "orders", purpose: "payment-evidence", ...(isStaff(claims) ? { dataClass: "payment-proof", objectId: payment.paymentId } : {}) });
    if(action!=="read"&&payment.actor?.epoch!==actor.epoch)fail("stale-authority",409);
    if (action !== "read" && isStaff(claims)) fail();
    return { ownerRef: ref(`paymentIntents/${payment.paymentId}`), owner: payment, version: payment.version, identity: actor };
  }
  async function paymentDetail(claims, paymentId) {
    return db.runTransaction(async tx => {
      const payment = (await tx.get(ref(`payments/${identifier(paymentId)}`))).data(); if (!payment) fail();
      const order = (await tx.get(orderRef(payment.orderId))).data();
      await authority(tx, claims, order, "proof-read", { domain: "payments", purpose: "payment-evidence", ...(isStaff(claims) ? { dataClass: "payment-proof", objectId: paymentId } : {}) });
      return { paymentId, orderId: payment.orderId, componentId: payment.componentId, amountMinor: payment.amountMinor, version: payment.version, paymentState: payment.state, proofReferenceId: payment.proofReferenceId, correctsPaymentId: payment.correctsPaymentId };
    });
  }
  async function reconcile(claims, operationId) {
    const receipt = (await ref(`transactionOperations/${identifier(operationId)}`).get()).data();
    return receipt?.actorUid === claims.uid ? { state: "committed", ...receipt.result } : { state: "unknown" };
  }
  return { mainOrderOwner, catalogueOrder, readOrder, listOrders, historicalEdition, commercial, paymentIntent, paymentSubmit, paymentReview, paymentDetail, extension, operational, authority, operation, financial, mediaContext, reconcile, orderRef, workRef, isStaff, db, ref, now, keyed, customer };
}
