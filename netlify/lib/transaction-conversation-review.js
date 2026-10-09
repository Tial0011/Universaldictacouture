import { AccountError, exactFields, fail, identifier } from "./account-contract.js";
import { resolveStaff, resolveStaffIdentity } from "./staff-authority.js";
import { publicProduct } from "./pretransaction-service.js";
import { normaliseReviewRecord, reviewIsPublic } from "../../src/services/reviewModel.js";
import { MESSAGE_LIMIT } from "../../src/services/chatModel.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export function createConversationReviewService(transactions) {
  const { db, ref, now, keyed, customer, authority, operation, isStaff, orderRef } = transactions;
  const MESSAGE_EDIT_WINDOW_MS = 30 * 60 * 1000;
  // The old UID conversation schema has intentionally separate legacy access.
  // New durable-Account conversations cannot inherit those direct-read Rules.
  // These are new distinct objects, not a second owner/copy of old threads.
  const chatRef = id => ref(`accountConversations/${identifier(id)}`);
  const actorKey = actor => actor?.kind === "staff" ? `staff:${actor.staffId}` : actor?.kind === "customer" ? `customer:${actor.accountId}` : "system";
  const publicActor = actor => actor?.kind === "staff" ? { kind: "staff", staffId: actor.staffId } : actor?.kind === "customer" ? { kind: "customer", accountId: actor.accountId } : { kind: "system" };
  const sameActor = (left, right) => actorKey(left) === actorKey(right) && actorKey(left) !== "system";
  const safeStaffLabel = value => typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : "Dicta Couturier";
  const ordinaryMessage = message => (message?.kind || (message?.actor?.kind === "system" ? "transaction-event" : "ordinary")) === "ordinary";
  const readStateRef = (chatId, actor) => ref(`chatReadStates/${keyed(`${chatId}:${actorKey(actor)}`)}`);
  const cursorKey = Buffer.from(keyed("section10-private-pagination"), "hex");
  function encodeCursor(uid, last) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", cursorKey, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify({ uid, last }), "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  }
  function decodeCursor(uid, token) {
    if (!token) return null;
    try {
      if (typeof token !== "string" || token.length > 2048) fail();
      const bytes = Buffer.from(token, "base64url"), decipher = createDecipheriv("aes-256-gcm", cursorKey, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
      if (value.uid !== uid) fail();
      return identifier(value.last);
    } catch { fail("invalid-cursor", 400); }
  }

  async function staffActor(tx, claims, actor) {
    if (actor?.kind !== "staff") return actor;
    const record = (await tx.get(ref(`admins/${claims.uid}`))).data();
    return { ...actor, label: safeStaffLabel(record?.displayName || record?.label) };
  }
  async function chatAuthority(tx, claims, chat, action, sensitive = false) {
    if (!chat || chat._ownerVersion !== 3) fail();
    if (chat.kind === "transaction") {
      const order = (await tx.get(orderRef(chat.orderId))).data();
      if (order?.chatId !== chat.chatId || order.accountId !== chat.accountId) fail();
      return authority(tx, claims, order, action, { domain: "chats", purpose: "customer-service", objectId: chat.chatId, ...(sensitive && isStaff(claims) ? { dataClass: "chat-attachment" } : {}) });
    }
    if (isStaff(claims)) {
      const staff = await resolveStaff(tx, db, claims, { capability: `chats.${action}`, purpose: "customer-service", objectId: chat.chatId, assignedStaffId: chat.assignedStaffId || null, state: "OPEN", action, ...(sensitive ? { dataClass: "chat-attachment" } : {}) }, now());
      return { kind: "staff", staffId: staff.staffId, label: safeStaffLabel(staff.displayName || staff.label) };
    }
    const owner = await customer(tx, claims); if (owner.accountId !== chat.accountId) fail(); return { kind: "customer", accountId: owner.accountId, epoch: owner.epoch };
  }
  async function requireWritableChat(tx, chat) {
    if (chat.kind !== "transaction") return;
    const order = (await tx.get(orderRef(chat.orderId))).data();
    if (!order) fail("source-unavailable", 503);
    const base = (await tx.get(transactions.workRef(chat.orderId))).data();
    const current = order.currentWork && order.currentWork !== "base" ? (await tx.get(transactions.workRef(chat.orderId, order.currentWork))).data() : base;
    if (!base || !current) fail("source-unavailable", 503);
    if (order.status === "CANCELLED" || base.completed && !order.activeExtensionId) fail("chat-dormant", 409);
  }
  async function generalChat(claims, input) {
    exactFields(input, ["operationId", "couturierStaffId"]); if (isStaff(claims)) fail();
    return db.runTransaction(async tx => {
      const owner = await customer(tx, claims);
      let assignedStaffId = null;
      if (input.couturierStaffId) {
        assignedStaffId = identifier(input.couturierStaffId);
        const identity = (await tx.get(ref(`staffIdentities/${assignedStaffId}`))).data();
        const member = identity?.principalUid ? (await tx.get(ref(`admins/${identity.principalUid}`))).data() : null;
        if (!identity?.active || !member?.active || member.sharedAccount || member.staffId !== assignedStaffId || member.functionAsCouturier !== true || member.eligible !== true || member.available !== true) fail("couturier-unavailable", 409);
      }
      const chatId = assignedStaffId ? `general:${owner.accountId}:${assignedStaffId}` : `general:${owner.accountId}`;
      const path = chatRef(chatId), prior = (await tx.get(path)).data();
      const actor = { kind: "customer", accountId: owner.accountId }, op = await operation(tx, claims, input, "chat.general-start", chatId, actor);
      if (op.prior) return { state: "committed", ...op.prior.result };
      if (!prior) tx.create(path, { _ownerVersion: 3, chatId, kind: "general", accountId: owner.accountId, assignedStaffId, sequence: 0, createdAt: now(), updatedAt: now() });
      else if (prior.accountId !== owner.accountId || prior.kind !== "general" || (prior.assignedStaffId || null) !== assignedStaffId) fail();
      return op.commit({ chatId });
    });
  }

  async function availableCouturiers(claims) {
    if (isStaff(claims)) fail();
    return db.runTransaction(async tx => {
      await customer(tx, claims);
      const rows = await tx.get(db.collection("admins").where("active", "==", true).limit(100)), eligible = [];
      for (const row of rows.docs) {
        const member = row.data();
        if (member.sharedAccount || member.functionAsCouturier !== true || member.eligible !== true || member.available !== true || !member.staffId) continue;
        const identity = (await tx.get(ref(`staffIdentities/${identifier(member.staffId)}`))).data();
        if (identity?.active !== true || identity.principalUid !== row.id) continue;
        eligible.push({ staffId: member.staffId, preferredLabel: safeStaffLabel(member.displayName || member.label) });
      }
      eligible.sort((left, right) => left.staffId.localeCompare(right.staffId));
      return { records: eligible.map((row, index) => ({ staffId: row.staffId, label: `Dicta Couturier ${index + 1}` })) };
    });
  }

  async function sourceContext(tx, source) {
    if (!source) return null;
    exactFields(source, ["kind", "productId", "reviewId", "imageIndex"]);
    if (source.kind === "product") {
      const productId = identifier(source.productId), product = publicProduct(productId, (await tx.get(ref(`products/${productId}`))).data());
      if (!product) return { kind: "product", id: productId, available: false };
      const imageIndex = source.imageIndex ?? 0;
      if (!Number.isSafeInteger(imageIndex) || imageIndex < 0 || source.imageIndex != null && !product.images?.[imageIndex]) fail("source-context-unavailable", 409);
      return { kind: "product", id: productId, available: true, title: product.name, image: product.images?.[imageIndex] || null, price: product.price, variable: product.hasVariablePricing === true };
    }
    if (source.kind === "review") {
      const reviewId = identifier(source.reviewId), managed = (await tx.get(ref(`accountReviews/${reviewId}`))).data(), legacy = managed ? null : (await tx.get(ref(`reviews/${reviewId}`))).data(), review = managed || legacy;
      if (!review || !await currentlyPublic(tx, review)) return { kind: "review", id: reviewId, available: false };
      const normalized = normaliseReviewRecord(reviewId, review);
      return { kind: "review", id: reviewId, available: true, title: "Dicta Moment", summary: normalized?.body?.slice(0, 220) || "Public customer story" };
    }
    fail("invalid-argument", 400);
  }

  async function messageProjection(tx, row, viewer) {
    const message = row.data(), kind = message.kind || (message.actor?.kind === "system" ? "transaction-event" : "ordinary"), deleted = message.deleted === true;
    let replyTo = null;
    if (!deleted && message.replyToMessageId) {
      const source = (await tx.get(row.ref.parent.doc(identifier(message.replyToMessageId)))).data();
      replyTo = !source || source.deleted ? { messageId: message.replyToMessageId, unavailable: true } : { messageId: message.replyToMessageId, unavailable: false, body: source.body?.slice(0, 300) || "Attachment", actorKind: source.actor?.kind || "unknown" };
    }
    const attachments = [];
    if (!deleted) for (const referenceId of message.attachmentReferenceIds || []) {
      const reference = (await tx.get(ref(`mediaReferences/${identifier(referenceId)}`))).data();
      if (reference?.active && reference.domain === "chat" && reference.objectId === message.chatId && reference.messageId === message.messageId) attachments.push({ referenceId, kind: "image" });
    }
    const source = !deleted && message.sourceContext ? await sourceContext(tx, message.sourceContext) : null;
    const expiresAt = ordinaryMessage(message) && Number.isFinite(message.createdAt) ? message.createdAt + MESSAGE_EDIT_WINDOW_MS : null;
    const mayChange = !deleted && ordinaryMessage(message) && sameActor(message.actor, viewer) && message.createdAt <= now() && expiresAt >= now();
    return { id: row.id, chatId: message.chatId, kind, eventTarget: kind === "transaction-event" ? message.eventTarget || null : null, body: deleted ? "" : message.body || "", actor: publicActor(message.actor), actorLabel: message.actorLabel || message.actor?.label || (message.actor?.kind === "staff" ? "Dicta Couturier" : message.actor?.kind === "system" ? "Order update" : "Customer"), sequence: message.sequence, createdAt: message.createdAt, editedAt: message.editedAt || null, deletedAt: message.deletedAt || null, deleted, version: message.version || 1, attachmentReferenceIds: attachments.map(value => value.referenceId), attachments, replyTo, sourceContext: source, canEdit: mayChange && Boolean(message.body), canDelete: mayChange, actionExpiresAt: expiresAt };
  }

  async function chatProjection(tx, claims, chat, actor, { detail = false } = {}) {
    const latestRows = await tx.get(chatRef(chat.chatId).collection("messages").orderBy("sequence", "desc").limit(1));
    const latest = latestRows.empty ? null : latestRows.docs[0].data(), read = (await tx.get(readStateRef(chat.chatId, actor))).data();
    const unreadRows = (chat.sequence || 0) > (read?.sequence || 0) ? await tx.get(chatRef(chat.chatId).collection("messages").where("sequence", ">", read?.sequence || 0).orderBy("sequence", "asc").limit(100)) : null;
    const unread = unreadRows?.docs.filter(row => !row.data().deleted && !sameActor(row.data().actor, actor)).length || 0;
    const unreadComplete = !unreadRows || unreadRows.size < 100 || unreadRows.docs.at(-1).data().sequence === chat.sequence;
    let order = null, work = null, ledger = null, assignedStaffId = chat.assignedStaffId || null;
    if (chat.kind === "transaction") {
      order = (await tx.get(orderRef(chat.orderId))).data();
      work = order ? (await tx.get(transactions.workRef(chat.orderId, order.currentWork || "base"))).data() : null;
      if (!order) fail("source-unavailable", 503);
      assignedStaffId = order.assignedStaffId || null;
      if (work) ledger = await transactions.financial(tx, order.orderId, work.componentId);
    }
    let couturier = "Dicta Couturier";
    if (assignedStaffId) {
      const identity = (await tx.get(ref(`staffIdentities/${assignedStaffId}`))).data(), member = identity?.principalUid ? (await tx.get(ref(`admins/${identity.principalUid}`))).data() : null;
      if (identity?.active && member?.active && member.staffId === assignedStaffId) couturier = safeStaffLabel(member.displayName || member.label);
    }
    const dormant = Boolean(order && (order.status === "CANCELLED" || work?.completed && !order.activeExtensionId));
    const sourceUnavailable = Boolean(order && !work);
    const currentPin = order && work?.currentEdition > 0 && !work.cancelled ? { id: `${order.orderId}:${work.componentId}:edition:${work.currentEdition}`, kind: work.componentId === "base" ? "edition" : "extension", title: work.componentId === "base" ? `Current Edition ${work.currentEdition}` : `Current Extension · Edition ${work.currentEdition}`, state: dormant ? "Read only" : order.status } : null;
    const projection = { chatId: chat.chatId, kind: chat.kind, title: chat.kind === "transaction" ? `Main Order ${chat.orderId}` : "General guidance", label: chat.kind === "transaction" ? "Main Order Chat" : "Free Chat", orderId: chat.orderId || null, orderNumber: chat.orderId || null, assignedStaffId, couturier, sequence: chat.sequence || 0, messageRevision: chat.messageRevision || 0, unread, unreadComplete, lastActivity: latest?.createdAt || chat.updatedAt || chat.createdAt, lastMessage: latest ? latest.deleted ? "Message deleted" : latest.actor?.kind === "system" ? "Order update" : (latest.body || (latest.attachmentReferenceIds?.length ? "Photo" : "Message")).slice(0, 120) : "No messages yet", dormant, sourceUnavailable, currentPin };
    if (detail && order && work) projection.order = { orderId: order.orderId, status: order.status, currentWork: order.currentWork, componentId: work.componentId, currentEdition: work.currentEdition, edition: work.edition || null, entries: work.currentEdition ? (await tx.get(transactions.workRef(order.orderId, work.componentId).collection("editions").doc(String(work.currentEdition)))).data()?.entries || [] : [], businessApproved: work.businessApproval?.edition === work.currentEdition, customerApproved: work.customerApproval?.edition === work.currentEdition, paymentEnabled: work.paymentEnabled?.edition === work.currentEdition, amountDueNowMinor: ledger?.amountDueNowMinor ?? null, totalPaidMinor: ledger?.totalPaidMinor ?? 0, outstandingMinor: ledger?.outstandingMinor ?? null, fulfilment: work.fulfilment, delivery: work.delivery, completed: work.completed, cancelled: work.cancelled };
    if (detail) { projection.media = { expectedVersion: chat.sequence || 0, expectedEpoch: actor.epoch ?? null }; projection.viewer = publicActor(actor); }
    return projection;
  }

  async function conversations(claims, cursor = null, relationshipChatId = null) {
    const after = decodeCursor(claims.uid, cursor);
    return db.runTransaction(async tx => {
      let relationship = null;
      if (relationshipChatId) {
        const current = (await tx.get(chatRef(relationshipChatId))).data();
        await chatAuthority(tx, claims, current, "read");
        relationship = current.kind === "transaction" ? (await tx.get(orderRef(current.orderId))).data()?.assignedStaffId : current.assignedStaffId;
        if (!relationship) return { records: [], complete: true, cursor: null };
      }
      let query = db.collection("accountConversations").orderBy("__name__").limit(50);
      if (isStaff(claims)) await resolveStaffIdentity(tx, db, claims, now());
      else { const owner = await customer(tx, claims); query = query.where("accountId", "==", owner.accountId); }
      if (after) query = query.startAfter(after);
      const rows = await tx.get(query);
      const records = [];
      for (const row of rows.docs) {
        const chat = row.data(); if (chat._ownerVersion !== 3) continue;
        let actor;
        try { actor = await chatAuthority(tx, claims, chat, "read"); }
        catch (error) { if (isStaff(claims) && error instanceof AccountError && [401, 403].includes(error.status)) continue; throw error; }
        const projection = await chatProjection(tx, claims, chat, actor);
        if (!relationship || projection.assignedStaffId === relationship) records.push(projection);
      }
      records.sort((left, right) => (right.lastActivity || 0) - (left.lastActivity || 0) || left.chatId.localeCompare(right.chatId));
      return { records, complete: rows.size < 50, cursor: rows.size === 50 ? encodeCursor(claims.uid, rows.docs.at(-1).id) : null };
    });
  }

  async function conversation(claims, chatId) {
    return db.runTransaction(async tx => {
      const chat = (await tx.get(chatRef(chatId))).data(), actor = await chatAuthority(tx, claims, chat, "read");
      return chatProjection(tx, claims, chat, actor, { detail: true });
    });
  }
  async function legacyHistory(claims, cursor = null) {
    if (isStaff(claims)) fail();
    const beforeId = decodeCursor(claims.uid, cursor);
    return db.runTransaction(async tx => {
      await customer(tx, claims);
      const path = ref(`conversations/${identifier(claims.uid)}`), legacy = (await tx.get(path)).data();
      if (!legacy) return { items: [], cursor: null };
      if (legacy.customerId !== claims.uid) fail();
      let query = path.collection("messages").orderBy("createdAt", "desc").orderBy("__name__", "desc").limit(30);
      if (beforeId) {
        const anchor = await tx.get(path.collection("messages").doc(beforeId));
        if (!anchor.exists) fail("invalid-cursor", 400);
        query = query.startAfter(anchor);
      }
      const rows = await tx.get(query);
      const items = rows.docs.map(row => {
        const value = row.data();
        return { id: row.id, body: typeof value.body === "string" ? value.body : "", author: value.senderRole === "admin" ? "Dicta Couturier" : "You", createdAt: value.createdAt?.toMillis?.() ?? null };
      });
      return { items: items.reverse(), cursor: rows.size === 30 ? encodeCursor(claims.uid, rows.docs.at(-1).id) : null };
    });
  }
  async function messages(claims, chatId, before = null) {
    return db.runTransaction(async tx => {
      const chat = (await tx.get(chatRef(chatId))).data(), actor = await chatAuthority(tx, claims, chat, "read");
      if (before != null && (!Number.isSafeInteger(before) || before < 1)) fail("invalid-argument", 400);
      let query = chatRef(chatId).collection("messages").orderBy("sequence", "desc").limit(30);
      if (before != null) query = query.where("sequence", "<", before);
      const rows = await tx.get(query);
      const items = await Promise.all(rows.docs.map(row => messageProjection(tx, row, actor)));
      return { chatId, items, cursor: items.at(-1)?.sequence || null, hasMore: rows.size === 30 };
    });
  }
  async function exactMessage(claims, chatId, messageId) {
    return db.runTransaction(async tx => {
      const chat = (await tx.get(chatRef(chatId))).data(), actor = await chatAuthority(tx, claims, chat, "read");
      if (chat.kind === "transaction" && messageId.startsWith(`${chat.orderId}:`)) {
        const suffix = messageId.slice(chat.orderId.length + 1), match = /^([^:]+):edition:([1-9][0-9]*)$/.exec(suffix);
        if (!match) fail("event-unavailable", 404);
        const componentId = identifier(match[1]), edition = Number(match[2]);
        const work = (await tx.get(transactions.workRef(chat.orderId, componentId))).data();
        const snapshot = (await tx.get(transactions.workRef(chat.orderId, componentId).collection("editions").doc(String(edition)))).data();
        if (!snapshot || !work || edition > work.currentEdition) fail("event-unavailable", 404);
        return { item: { id: messageId, chatId, kind: "transaction-event", body: `Historical Edition ${edition} · ${componentId === "base" ? "Base" : "Extension"}`, actor: { kind: "system" }, actorLabel: "Order history", sequence: 0, createdAt: snapshot.establishedAt ?? null, version: 1, canEdit: false, canDelete: false, attachments: [], eventTarget: { orderId: chat.orderId, componentId, edition } } };
      }
      const row = await tx.get(chatRef(chatId).collection("messages").doc(identifier(messageId)));
      if (!row.exists || row.data().chatId !== chatId) fail("event-unavailable", 404);
      return { item: await messageProjection(tx, row, actor) };
    });
  }
  async function send(claims, input) {
    exactFields(input, ["operationId", "chatId", "body", "assetIds", "replyToMessageId", "sourceContext"]);
    if (typeof input.body !== "string" || input.body.length > MESSAGE_LIMIT || input.assetIds && (!Array.isArray(input.assetIds) || input.assetIds.length > 4 || new Set(input.assetIds).size !== input.assetIds.length) || !input.body.trim() && !input.assetIds?.length && !input.sourceContext) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const path = chatRef(input.chatId), chat = (await tx.get(path)).data(), authorizedActor = await chatAuthority(tx, claims, chat, "reply", Boolean(input.assetIds?.length)), actor = await staffActor(tx, claims, authorizedActor);
      const op = await operation(tx, claims, input, "chat.send", input.chatId, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      await requireWritableChat(tx, chat);
      const messageId = keyed(`message:${claims.uid}:${input.operationId}`), attachments = [];
      for (const assetId of input.assetIds || []) { const asset = (await tx.get(ref(`mediaAssets/${identifier(assetId)}`))).data(); if (!asset || asset.domain !== "chat" || asset.objectId !== input.chatId || asset.actorUid !== claims.uid || asset.state !== "validated" || asset.purgeState || asset.expectedEpoch !== (actor.epoch ?? null)) fail(); attachments.push(asset); }
      let replyToMessageId = null;
      if (input.replyToMessageId) { replyToMessageId = identifier(input.replyToMessageId); const reply = (await tx.get(path.collection("messages").doc(replyToMessageId))).data(); if (!reply || reply.chatId !== input.chatId || reply.deleted || !ordinaryMessage(reply)) fail("reply-unavailable", 409); }
      const resolvedSource = input.sourceContext ? await sourceContext(tx, input.sourceContext) : null; if (resolvedSource && !resolvedSource.available) fail("source-context-unavailable", 409);
      const sourceReference = resolvedSource ? resolvedSource.kind === "product" ? { kind: "product", productId: resolvedSource.id, ...(input.sourceContext.imageIndex != null ? { imageIndex: input.sourceContext.imageIndex } : {}) } : { kind: "review", reviewId: resolvedSource.id } : null;
      const references = attachments.map(asset => keyed(`chat-attachment:${messageId}:${asset.assetId}`));
      attachments.forEach((asset, index) => { tx.create(ref(`mediaReferences/${references[index]}`), { referenceId: references[index], assetId: asset.assetId, domain: "chat", objectId: input.chatId, messageId, active: true, protected: true }); tx.update(ref(`mediaAssets/${asset.assetId}`), { everAttached: true }); });
      tx.create(path.collection("messages").doc(messageId), { messageId, chatId: input.chatId, kind: "ordinary", body: input.body.trim(), actor, actorLabel: actor.label || (actor.kind === "staff" ? "Dicta Couturier" : "Customer"), executor: "system:chat-commit", version: 1, sequence: chat.sequence + 1, createdAt: now(), attachmentReferenceIds: references, ...(replyToMessageId ? { replyToMessageId } : {}), ...(sourceReference ? { sourceContext: sourceReference } : {}) });
      tx.update(path, { sequence: chat.sequence + 1, updatedAt: now() });
      // No Order/Payment/approval mutation is performed for any free-text body.
      return op.commit({ messageId, chatId: input.chatId, sequence: chat.sequence + 1 });
    });
  }

  async function changeMessage(claims, input) {
    exactFields(input, ["operationId", "chatId", "messageId", "expectedVersion", "action", "body"]);
    if (!["edit", "delete"].includes(input.action) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || input.action === "edit" && (typeof input.body !== "string" || !input.body.trim() || input.body.length > MESSAGE_LIMIT)) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const path = chatRef(input.chatId), chat = (await tx.get(path)).data(), actor = await chatAuthority(tx, claims, chat, "reply"), messagePath = path.collection("messages").doc(identifier(input.messageId)), message = (await tx.get(messagePath)).data();
      const op = await operation(tx, claims, input, `chat.message-${input.action}`, `${input.chatId}:${input.messageId}`, actor); if (op.prior) return { state: "committed", ...op.prior.result };
      await requireWritableChat(tx, chat);
      const version = message?.version || 1, age = now() - message?.createdAt;
      if (!message || message.chatId !== input.chatId || !ordinaryMessage(message) || message.deleted || !sameActor(message.actor, actor) || version !== input.expectedVersion || !Number.isFinite(age) || age < 0 || age > MESSAGE_EDIT_WINDOW_MS) fail("message-action-expired", 409);
      const references = [];
      if (input.action === "delete") for (const referenceId of message.attachmentReferenceIds || []) {
        const referencePath = ref(`mediaReferences/${identifier(referenceId)}`), reference = (await tx.get(referencePath)).data();
        if (reference?.active && reference.domain === "chat" && reference.objectId === input.chatId && reference.messageId === input.messageId) references.push(referencePath);
      }
      const historyId = identifier(input.operationId);
      tx.create(ref(`chatMessageHistory/${historyId}`), { chatId: input.chatId, messageId: input.messageId, action: input.action, previousVersion: version, previousBody: message.body || "", previousAttachmentReferenceIds: message.attachmentReferenceIds || [], actor, at: now() });
      if (input.action === "edit") tx.update(messagePath, { body: input.body.trim(), version: version + 1, editedAt: now() });
      else {
        for (const referencePath of references) tx.update(referencePath, { active: false, detachedAt: now() });
        tx.update(messagePath, { body: "", deleted: true, deletedAt: now(), version: version + 1, attachmentReferenceIds: [] });
      }
      tx.update(path, { updatedAt: now(), messageRevision: (chat.messageRevision || 0) + 1 });
      return op.commit({ chatId: input.chatId, messageId: input.messageId, version: version + 1, action: input.action });
    });
  }

  async function markRead(claims, input) {
    exactFields(input, ["operationId", "chatId", "sequence"]);
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const path = chatRef(input.chatId), chat = (await tx.get(path)).data(), actor = await chatAuthority(tx, claims, chat, "read"), op = await operation(tx, claims, input, "chat.mark-read", input.chatId, actor);
      if (op.prior) return { state: "committed", ...op.prior.result };
      if (input.sequence > (chat.sequence || 0)) fail("stale-conflict", 409);
      const statePath = readStateRef(input.chatId, actor), prior = (await tx.get(statePath)).data(), sequence = Math.max(prior?.sequence || 0, input.sequence);
      tx.set(statePath, { chatId: input.chatId, actorKey: actorKey(actor), sequence, updatedAt: now() });
      return op.commit({ chatId: input.chatId, sequence });
    });
  }

  async function search(claims, chatId, term, before = null) {
    if (typeof term !== "string" || !term.trim() || term.length > 120) fail("invalid-argument", 400);
    if (before != null && (!Number.isSafeInteger(before) || before < 1)) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const chat = (await tx.get(chatRef(chatId))).data(), actor = await chatAuthority(tx, claims, chat, "read");
      let query = chatRef(chatId).collection("messages").orderBy("sequence", "desc").limit(100);
      if (before != null) query = query.where("sequence", "<", before);
      const rows = await tx.get(query), needle = term.trim().toLocaleLowerCase(), items = [];
      for (const row of rows.docs) { const raw = row.data(); if (raw.deleted || !String(raw.body || "").toLocaleLowerCase().includes(needle)) continue; items.push(await messageProjection(tx, row, actor)); }
      return { chatId, items, complete: rows.size < 100, cursor: rows.size === 100 ? rows.docs.at(-1).data().sequence : null };
    });
  }

  async function mediaHistory(claims, chatId, before = null) {
    if (before != null && (!Number.isSafeInteger(before) || before < 1)) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const chat = (await tx.get(chatRef(chatId))).data(), actor = await chatAuthority(tx, claims, chat, "read");
      let query = chatRef(chatId).collection("messages").orderBy("sequence", "desc").limit(100);
      if (before != null) query = query.where("sequence", "<", before);
      const rows = await tx.get(query), items = [];
      for (const row of rows.docs) { if (row.data().deleted || !row.data().attachmentReferenceIds?.length) continue; const projected = await messageProjection(tx, row, actor); if (projected.attachments.length) items.push(projected); }
      return { chatId, items, complete: rows.size < 100, cursor: rows.size === 100 ? rows.docs.at(-1).data().sequence : null };
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
      tx.create(messagePath, { messageId, chatId, kind: "transaction-event", body: body.trim(), actor: { kind: "system", executor: "system:qualified-chat-consequence" }, actorLabel: "Order update", originalActor: source.actor, sourceOperationId, executor: "system:qualified-chat-consequence", version: 1, sequence: chat.sequence + 1, createdAt: now(), attachmentReferenceIds: [] });
      tx.update(path, { sequence: chat.sequence + 1, updatedAt: now() }); return { state: "committed", messageId };
    });
  }
  return { generalChat, availableCouturiers, conversations, conversation, legacyHistory, messages, exactMessage, send, changeMessage, markRead, search, mediaHistory, submitReview, changeReview, feed, reviewToDraft, mediaContext, appendSystemMessage, attachReviewMedia, publicMedia };
}
