import { exactFields, fail, identifier } from "./account-contract.js";
import { resolveStaff } from "./staff-authority.js";
import { publicProduct } from "./pretransaction-service.js";
import { normaliseReviewRecord, reviewIsPublic } from "../../src/services/reviewModel.js";
import { MESSAGE_LIMIT } from "../../src/services/chatModel.js";
export function createConversationReviewService(transactions) {
  const { db, ref, now, keyed, customer, authority, operation, isStaff, orderRef } = transactions;
  // The old UID conversation schema has intentionally separate legacy access.
  // New durable-Account conversations cannot inherit those direct-read Rules.
  // These are new distinct objects, not a second owner/copy of old threads.
  const chatRef = id => ref(`accountConversations/${identifier(id)}`);
  async function chatAuthority(tx, claims, chat, action, sensitive = false) {
    if (!chat || chat._ownerVersion !== 3) fail();
    if (chat.kind === "transaction") {
      const order = (await tx.get(orderRef(chat.orderId))).data();
      if (order?.chatId !== chat.chatId || order.accountId !== chat.accountId) fail();
      return authority(tx, claims, order, action, { domain: "chats", purpose: "customer-service", objectId: chat.chatId, ...(sensitive && isStaff(claims) ? { dataClass: "chat-attachment" } : {}) });
    }
    if (isStaff(claims)) {
      const staff = await resolveStaff(tx, db, claims, { capability: `chats.${action}`, purpose: "customer-service", objectId: chat.chatId, state: "OPEN", action, ...(sensitive ? { dataClass: "chat-attachment" } : {}) }, now());
      return { kind: "staff", staffId: staff.staffId };
    }
    const owner = await customer(tx, claims); if (owner.accountId !== chat.accountId) fail(); return { kind: "customer", accountId: owner.accountId, epoch: owner.epoch };
  }
  async function generalChat(claims, input) {
    exactFields(input, ["operationId"]); if (isStaff(claims)) fail();
    return db.runTransaction(async tx => {
      const owner = await customer(tx, claims), chatId = `general:${owner.accountId}`, path = chatRef(chatId), prior = (await tx.get(path)).data();
      const actor = { kind: "customer", accountId: owner.accountId }, op = await operation(tx, claims, input, "chat.general-start", chatId, actor);
      if (op.prior) return { state: "committed", ...op.prior.result };
      if (!prior) tx.create(path, { _ownerVersion: 3, chatId, kind: "general", accountId: owner.accountId, sequence: 0, createdAt: now() });
      else if (prior.accountId !== owner.accountId || prior.kind !== "general") fail();
      return op.commit({ chatId });
    });
  }
  async function messages(claims, chatId, before = null) {
    return db.runTransaction(async tx => {
      const chat = (await tx.get(chatRef(chatId))).data(); await chatAuthority(tx, claims, chat, "read");
      if (before != null && (!Number.isSafeInteger(before) || before < 1)) fail("invalid-argument", 400);
      let query = chatRef(chatId).collection("messages").orderBy("sequence", "desc").limit(30);
      if (before != null) query = query.where("sequence", "<", before);
      const rows = await tx.get(query);
      const items = rows.docs.map(row => ({ id: row.id, chatId, body: row.data().body, actor: row.data().actor, senderRole: row.data().actor.kind, sequence: row.data().sequence, createdAt: row.data().createdAt, attachmentReferenceIds: row.data().attachmentReferenceIds || [] }));
      return { chatId, items, cursor: items.at(-1)?.sequence || null, hasMore: rows.size === 30 };
    });
  }
  async function send(claims, input) {
    exactFields(input, ["operationId", "chatId", "body", "assetIds"]);
    if (typeof input.body !== "string" || !input.body.trim() || input.body.length > MESSAGE_LIMIT || input.assetIds && (!Array.isArray(input.assetIds) || input.assetIds.length > 4)) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const path = chatRef(input.chatId), chat = (await tx.get(path)).data(), actor = await chatAuthority(tx, claims, chat, "reply", Boolean(input.assetIds?.length));
      const op = await operation(tx, claims, input, "chat.send", input.chatId, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      if (chat.kind === "transaction") { const order = (await tx.get(orderRef(chat.orderId))).data(), base = (await tx.get(transactions.workRef(chat.orderId))).data(); if (order.status === "CANCELLED" || base.completed && !order.activeExtensionId) fail("chat-dormant", 409); }
      const messageId = keyed(`message:${claims.uid}:${input.operationId}`), attachments = [];
      for (const assetId of input.assetIds || []) { const asset = (await tx.get(ref(`mediaAssets/${identifier(assetId)}`))).data(); if (!asset || asset.domain !== "chat" || asset.objectId !== input.chatId || asset.actorUid !== claims.uid || asset.state !== "validated" || asset.purgeState || asset.expectedEpoch !== (actor.epoch ?? null)) fail(); attachments.push(asset); }
      const references = attachments.map(asset => keyed(`chat-attachment:${messageId}:${asset.assetId}`));
      attachments.forEach((asset, index) => { tx.create(ref(`mediaReferences/${references[index]}`), { referenceId: references[index], assetId: asset.assetId, domain: "chat", objectId: input.chatId, messageId, active: true, protected: true }); tx.update(ref(`mediaAssets/${asset.assetId}`), { everAttached: true }); });
      tx.create(path.collection("messages").doc(messageId), { messageId, chatId: input.chatId, body: input.body.trim(), actor, executor: "system:chat-commit", sequence: chat.sequence + 1, createdAt: now(), attachmentReferenceIds: references });
      tx.update(path, { sequence: chat.sequence + 1 });
      // No Order/Payment/approval mutation is performed for any free-text body.
      return op.commit({ messageId, chatId: input.chatId, sequence: chat.sequence + 1 });
    });
  }
  async function reviewAuthority(tx, claims, review, action, sensitive = false) {
    if (!review || review._ownerVersion !== 3) fail();
    if (!isStaff(claims)) { const owner = await customer(tx, claims); if (owner.accountId !== review.authorAccountId) fail(); return { kind: "customer", accountId: owner.accountId, epoch: owner.epoch }; }
    const staff = await resolveStaff(tx, db, claims, { capability: `reviews.${action}`, purpose: "moderation", objectId: review.reviewId, state: review.status, action, ...(sensitive ? { dataClass: "review-media" } : {}) }, now()); return { kind: "staff", staffId: staff.staffId };
  }
  async function submitReview(claims, input) {
    exactFields(input, ["operationId", "orderId", "expectedVersion", "body", "customerServiceRating", "productQualityRating", "productId"]); if (isStaff(claims)) fail();
    if (typeof input.body !== "string" || !input.body.trim() || input.body.length > 4000 || ![input.customerServiceRating, input.productQualityRating].every(v => Number.isInteger(v) && v >= 1 && v <= 5)) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const order = (await tx.get(orderRef(input.orderId))).data(), actor = await authority(tx, claims, order, "review"), base = (await tx.get(transactions.workRef(input.orderId))).data();
      const op = await operation(tx, claims, input, "review.submit", input.orderId, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      if (!base.completed || order.activeExtensionId || !order.reviewEnabled || order.version !== input.expectedVersion) fail("review-ineligible", 409);
      const edition = (await tx.get(transactions.workRef(input.orderId).collection("editions").doc(String(base.currentEdition)))).data();
      if (input.productId && !edition?.entries.some(entry => entry.productId === input.productId)) fail();
      const profile = (await tx.get(ref(`customerProfiles/${order.accountId}`))).data();
      const entry = input.productId ? edition?.entries.find(item => item.productId === input.productId) : null;
      const reviewId = keyed(`review:${claims.uid}:${input.operationId}`);
      if ((await tx.get(ref(`reviews/${reviewId}`))).exists) fail("review-source-ambiguous", 409);
      tx.create(ref(`accountReviews/${reviewId}`), { _ownerVersion: 3, reviewId, authorAccountId: order.accountId, author: profile?.fields?.publicDisplayName || "", orderId: order.orderId, edition: base.currentEdition, productId: input.productId || "", productSnapshot: entry ? { name: entry.label, price: entry.unitAmountMinor / 100, slug: input.productId, image: null } : null, body: input.body.trim(), customerServiceRating: input.customerServiceRating, productQualityRating: input.productQualityRating, version: 1, status: "pending", published: false, moderation: "PENDING", permissions: { publication: false, productReuse: false, promotion: false }, mediaRefs: [], submittedAt: now() });
      return op.commit({ reviewId, version: 1 });
    });
  }
  async function changeReview(claims, input) {
    exactFields(input, ["operationId", "reviewId", "expectedVersion", "action", "scope", "allowed", "decision", "reason"]);
    if (!["permission", "moderate", "publish", "unpublish"].includes(input.action)) fail("invalid-argument", 400);
    if (input.action === "permission" ? isStaff(claims) : !isStaff(claims)) fail();
    return db.runTransaction(async tx => {
      const path = ref(`accountReviews/${identifier(input.reviewId)}`), review = (await tx.get(path)).data(), actor = await reviewAuthority(tx, claims, review, input.action);
      const op = await operation(tx, claims, input, `review.${input.action}`, input.reviewId, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      if (review.version !== input.expectedVersion) fail("stale-conflict", 409);
      let update = { version: review.version + 1 };
      if (input.action === "permission") {
        if (!["publication", "productReuse", "promotion"].includes(input.scope) || typeof input.allowed !== "boolean") fail("invalid-argument", 400);
        update.permissions = { ...review.permissions, [input.scope]: input.allowed };
        tx.create(ref(`reviewConsentEvidence/${input.operationId}`), { reviewId: review.reviewId, scope: input.scope, allowed: input.allowed, actor, at: now(), version: update.version });
      }
      if (input.action === "moderate") { if (!["APPROVED", "NEEDS ATTENTION"].includes(input.decision) || typeof input.reason !== "string") fail("invalid-argument", 400); update.moderation = input.decision; if (input.decision !== "APPROVED") { update.status = "hidden"; update.published = false; } }
      if (input.action === "publish") { if (!await currentlyPublic(tx,{...review,status:"published",published:true})) fail("publication-ineligible",409); update.status = "published"; update.published = true; if (!review.publishedAt) update.publishedAt = now(); }
      if (input.action === "unpublish") { update.status = "hidden"; update.published = false; }
      tx.update(path, update); tx.create(ref(`reviewHistory/${input.operationId}`), { reviewId: review.reviewId, action: input.action, actor, at: now(), version: update.version, ...(input.decision ? { decision: input.decision, reason: input.reason } : {}) });
      if (review.publishedAt || input.action === "publish") tx.set(ref(`reviewPublicState/${review.reviewId}`), { publicAllowed: Boolean(reviewIsPublic({ ...review, ...update })), version: update.version });
      return op.commit({ reviewId: review.reviewId, version: update.version });
    });
  }
  async function feed() {
    return db.runTransaction(async tx => {
      const [currentRows, legacyRows] = await Promise.all([tx.get(db.collection("accountReviews").where("published", "==", true).limit(500)), tx.get(db.collection("reviews").where("published", "==", true).limit(500))]);
      const rows = { docs: [...currentRows.docs, ...legacyRows.docs] }, records = [];
      for (const row of rows.docs) {
        const data = row.data(); if (!await currentlyPublic(tx,data)) continue;
        const normalized = normaliseReviewRecord(row.id, data); if (!normalized) continue;
        const product = data.productId ? publicProduct(data.productId, (await tx.get(ref(`products/${identifier(data.productId)}`))).data()) : null;
        records.push({ id: row.id, managed: data._ownerVersion === 3, author: typeof data.author === "string" ? data.author : "", body: normalized.body, customerServiceRating: normalized.customerServiceRating, productQualityRating: normalized.productQualityRating, productId: product?.id || "", productSnapshot: normalized.productSnapshot, image: data._ownerVersion === 3 ? data.mediaRefs?.[0] ? {url:`/.netlify/functions/account?action=public-media&referenceId=${data.mediaRefs[0]}`,alt:"Customer review photo"}:null : normalized.image, published: true, publishedAt: normalized.publishedAt, submittedAt: normalized.submittedAt });
      }
      return { records }; // No Account IDs, staff notes or consent evidence.
    });
  }
  async function currentlyPublic(tx,review){
    if(!reviewIsPublic(review))return false;if(review._ownerVersion!==3)return true;
    const order=(await tx.get(orderRef(review.orderId))).data(),base=(await tx.get(transactions.workRef(review.orderId))).data();
    return order?.accountId===review.authorAccountId&&base?.completed&&order.reviewEnabled&&!order.activeExtensionId;
  }
  async function reviewToDraft(claims, input) {
    exactFields(input, ["operationId", "reviewId", "expectedVersion"]); if (!isStaff(claims)) fail();
    return db.runTransaction(async tx => {
      const review = (await tx.get(ref(`accountReviews/${identifier(input.reviewId)}`))).data(), actor = await reviewAuthority(tx, claims, review, "product-draft");
      const op = await operation(tx, claims, input, "review.product-draft", input.reviewId, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      if (review.version !== input.expectedVersion || !review.permissions.productReuse) fail("reuse-not-authorized", 409);
      const productId = keyed(`review-draft:${review.reviewId}:${input.operationId}`);
      await resolveStaff(tx, db, claims, { capability: "products.create", purpose: "catalogue", objectId: productId, action: "create", state: "draft" }, now());
      tx.create(ref(`products/${productId}`), { _ownerVersion: 2, _version: 1, status: "draft", archived: false, name: review.productSnapshot?.name || "", description: "", images: [], price: null, unitLabel: "", category: [], originReviewId: review.reviewId, originReviewVersion: review.version, permissionEvidenceAt: now(), createdAt: now() });
      return op.commit({ productId }); // No media reuse, Review rewrite or publish.
    });
  }
  async function mediaContext(tx, claims, input, action) {
    if (input.domain === "review") {
      const path = ref(`accountReviews/${identifier(input.objectId)}`), review = (await tx.get(path)).data(), actor = await reviewAuthority(tx, claims, review, action === "read" ? "media-read" : "media-change", true);
      if (action !== "read" && isStaff(claims)) fail();
      return { ownerRef: path, owner: review, version: review.version, identity: actor };
    }
    if (input.domain !== "chat") return null;
    const path = chatRef(input.objectId), chat = (await tx.get(path)).data(), actor = await chatAuthority(tx, claims, chat, action === "read" ? "read" : "reply", true);
    return { ownerRef: path, owner: chat, version: chat.sequence, identity: actor };
  }
  async function attachReviewMedia(claims, input) {
    exactFields(input,["operationId","reviewId","expectedVersion","assetId"]); if(isStaff(claims))fail();
    return db.runTransaction(async tx=>{
      const path=ref(`accountReviews/${identifier(input.reviewId)}`),review=(await tx.get(path)).data(),actor=await reviewAuthority(tx,claims,review,"media-change");
      const op=await operation(tx,claims,input,"review.media-change",input.reviewId,actor);if(op.prior)return{state:"committed",...op.prior.result};
      const asset=(await tx.get(ref(`mediaAssets/${identifier(input.assetId)}`))).data();
      const old=[];for(const referenceId of review.mediaRefs||[])old.push(await tx.get(ref(`mediaReferences/${referenceId}`)));
      if(review.version!==input.expectedVersion||!asset||asset.domain!=="review"||asset.objectId!==review.reviewId||asset.actorUid!==claims.uid||asset.expectedVersion!==review.version||asset.expectedEpoch!==actor.epoch||asset.purgeState||asset.state!=="validated")fail("stale-conflict",409);
      const referenceId=keyed(`review-media:${review.reviewId}:${input.operationId}`);
      tx.create(ref(`mediaReferences/${referenceId}`),{referenceId,assetId:asset.assetId,domain:"review",objectId:review.reviewId,active:true,protected:true});tx.update(ref(`mediaAssets/${asset.assetId}`),{everAttached:true});
      for(const reference of old)tx.update(reference.ref,{active:false});
      tx.update(path,{mediaRefs:[referenceId],version:review.version+1,moderation:"PENDING",published:false,status:"pending",permissions:{publication:false,productReuse:false,promotion:false}});
      if(review.publishedAt)tx.set(ref(`reviewPublicState/${review.reviewId}`),{publicAllowed:false,version:review.version+1});
      tx.create(ref(`reviewHistory/${input.operationId}`),{reviewId:review.reviewId,action:"media-change",actor,at:now(),previousRefs:review.mediaRefs||[],previousPermissions:review.permissions,referenceId});
      return op.commit({reviewId:review.reviewId,version:review.version+1});
    });
  }
  async function publicMedia(tx, reference) {
    if(reference.domain!=="review")return false;
    const review=(await tx.get(ref(`accountReviews/${reference.objectId}`))).data();return await currentlyPublic(tx,review)&&review.mediaRefs?.includes(reference.referenceId)&&reference.active;
  }
  async function appendSystemMessage({ chatId, sourceOperationId, body }) {
    if (typeof body !== "string" || !body.trim() || body.length > MESSAGE_LIMIT) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const path = chatRef(chatId), chat = (await tx.get(path)).data(), source = (await tx.get(ref(`transactionOperations/${identifier(sourceOperationId)}`))).data();
      if (!chat || chat.kind !== "transaction" || source?.state !== "committed" || ![chat.orderId,chat.orderId+":base"].includes(source.target)) fail();
      const messageId = keyed(`system-message:${chatId}:${sourceOperationId}`), messagePath = path.collection("messages").doc(messageId), prior = (await tx.get(messagePath)).data();
      if (prior) return { state: "committed", messageId };
      tx.create(messagePath, { messageId, chatId, body: body.trim(), actor: { kind: "system", executor: "system:qualified-chat-consequence" }, originalActor: source.actor, sourceOperationId, executor: "system:qualified-chat-consequence", sequence: chat.sequence + 1, createdAt: now(), attachmentReferenceIds: [] });
      tx.update(path, { sequence: chat.sequence + 1 }); return { state: "committed", messageId };
    });
  }
  return { generalChat, messages, send, submitReview, changeReview, feed, reviewToDraft, mediaContext, appendSystemMessage, attachReviewMedia, publicMedia };
}
