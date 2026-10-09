import { exactFields, fail, identifier } from "./account-contract.js";
import { resolveStaff } from "./staff-authority.js";
import { normaliseProduct } from "../../src/services/productModel.js";
import { productReadiness } from "../../src/services/adminModel.js";
import { reviewIsPublic } from "../../src/services/reviewModel.js";

export const PRODUCT_FIELDS = ["name", "slug", "description", "price", "unitLabel", "priceToken", "category", "occasion", "style", "fabric", "colour", "size", "shopBy", "primaryImage", "images", "options", "variants", "aliases", "keywords", "isNewIn"];
export const REQUEST_FIELDS = ["serviceType", "eventName", "dateNeeded", "stylePreferences", "fabricPreferences", "colourPreferences", "measurements", "deliveryLocation", "quantity", "matchingPieces", "notes"];
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value || {}, key)).map(key => [key, value[key]]));
function fields(value, allowed, limit = 24000) {
  exactFields(value, allowed);
  if (Buffer.byteLength(JSON.stringify(value)) > limit) fail("invalid-argument", 400);
  // Text is inert data; renderer must never interpret it as markup.
  return structuredClone(value);
}
export function publicProduct(id, raw) {
  if (raw?.status !== "published" || raw.archived === true) return null;
  const representation = raw._ownerVersion === 2 ? raw.publicRepresentation : raw;
  if (!representation) return null;
  const product = normaliseProduct(id, { ...pick(representation, PRODUCT_FIELDS), status: "published", publishedAt: raw.publishedAt || raw.firstPublishedAt });
  return product ? { ...product, publicVersion: raw.publicVersion ?? raw._version ?? 0 } : null;
}

// M03/M05/M06 use the existing identity/session boundary. This module never
// creates an Account, Staff identity, assignment engine or transaction engine.
export function createPretransactionService(account, { mainOrderOwner, prepareProductMedia } = {}) {
  const { db, ref, now, keyed, customer } = account;
  const productRef = id => ref(`products/${identifier(id)}`);
  const relationshipRef = (accountId, kind, targetId) => ref(`customerContinuity/${keyed(JSON.stringify([accountId, kind, targetId]))}`);
  async function receipt(tx, claims, input, action, target, actor) {
    const operationId = identifier(input.operationId), path = ref(`pretransactionOperations/${operationId}`);
    const fingerprint = keyed(JSON.stringify({ uid: claims.uid, action, target, input }));
    const prior = (await tx.get(path)).data();
    if (prior && (prior.actorUid !== claims.uid || prior.fingerprint !== fingerprint)) fail("operation-conflict", 409);
    return { prior, commit(result) {
      tx.create(path, { operationId, actorUid: claims.uid, actor, action, target, fingerprint, result, createdAt: now(), state: "committed" });
      account.capture(tx, { domain: "pretransaction", operationId, action, target, actor, executor: "system:pretransaction-api" });
      return { state: "committed", ...result };
    } };
  }
  async function staff(tx, claims, capability, objectId, state, extra = {}) {
    return resolveStaff(tx, db, claims, { capability, purpose: "catalogue", objectId, action: capability.split(".").at(-1), state, ...extra }, now());
  }
  async function catalogue(productId) {
    return db.runTransaction(async tx => {
      if (productId) {
        const row = await tx.get(productRef(productId));
        return { product: publicProduct(row.id, row.data()) };
      }
      const rows = await tx.get(db.collection("products").where("status", "==", "published").limit(1000));
      return { products: rows.docs.map(row => publicProduct(row.id, row.data())).filter(Boolean) };
    });
  }
  async function mutateProduct(claims, input) {
    exactFields(input, ["operationId", "productId", "expectedVersion", "action", "fields"]);
    const action = input.action;
    if (!["create", "save", "publish", "unpublish", "archive", "restore", "hard-delete"].includes(action)) fail("invalid-argument", 400);
    const id = action === "create" ? keyed(`product:${claims.uid}:${identifier(input.operationId)}`).slice(0, 40) : identifier(input.productId);
    const changes = ["create", "save"].includes(action) ? fields(input.fields, PRODUCT_FIELDS) : {};
    for (const key of ["name", "slug", "description", "unitLabel", "priceToken"]) if (Object.hasOwn(changes, key) && typeof changes[key] !== "string") fail("invalid-argument", 400);
    if (changes.description?.length > 4000 || changes.unitLabel?.length > 120 || changes.priceToken?.length > 120) fail("invalid-argument", 400);
    if (Object.hasOwn(changes, "price") && changes.price !== null && (typeof changes.price !== "number" || !Number.isFinite(changes.price) || changes.price < 0)) fail("invalid-argument", 400);
    if (Object.hasOwn(changes, "isNewIn") && typeof changes.isNewIn !== "boolean") fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const path = productRef(id), prior = (await tx.get(path)).data(), state = prior?.status || "draft";
      if (!["draft", "published", "unpublished", "archived"].includes(state)) fail("product-state-unavailable", 409);
      const changedKeys = Object.keys(changes).filter(key => JSON.stringify(changes[key]) !== JSON.stringify(prior?.[key]));
      const family = key => ["price", "unitLabel", "priceToken", "variants"].includes(key) ? "commercial" : ["images", "primaryImage"].includes(key) ? "media" : ["category", "occasion", "style", "fabric", "colour", "shopBy", "isNewIn", "aliases", "keywords"].includes(key) ? "discovery" : "edit";
      const fieldCapabilities = [...new Set(changedKeys.map(key => `products.${family(key)}`))];
      const capability = action === "save" ? fieldCapabilities[0] || "products.edit" : "products." + (action === "hard-delete" ? "delete" : action);
      const actor = await staff(tx, claims, capability, id, state, { action });
      const operation = await receipt(tx, claims, input, `product.${action}`, id, { kind: "staff", staffId: actor.staffId });
      if (operation.prior) return { state: "committed", ...operation.prior.result };
      if (action === "create" ? prior : !prior || (prior._version || 0) !== input.expectedVersion) fail("stale-conflict", 409);
      if (action === "save" && state === "archived") fail("stale-conflict", 409);
      if (action === "hard-delete") {
        // Later owner reference registries are not yet complete. No guessed
        // empty query/counter can prove a legacy Draft dependency-free.
        fail("historical-reference-check-unavailable", 503);
      }
      const working = { ...pick(prior, PRODUCT_FIELDS), ...changes };
      for (const fieldCapability of fieldCapabilities) if (fieldCapability !== capability) await staff(tx, claims, fieldCapability, id, state, { action });
      let mediaCommit = () => {};
      if (Array.isArray(changes.images) && (changes.images.some(image => image?.assetId || image?.referenceId) || prior?.images?.some(image => image?.referenceId))) {
        if (!prepareProductMedia) fail("media-owner-unavailable", 503);
        const prepared = await prepareProductMedia(tx, claims, { productId: id, expectedVersion: prior?._version || 0, operationId: input.operationId, images: changes.images });
        working.images = prepared.images; working.primaryImage = prepared.images[0] || null; mediaCommit = prepared.commit;
      }
      if (Array.isArray(changes.images)) working.primaryImage = working.images[0] || null;
      // Current definition identities remain intact; inactive definitions cannot
      // be newly assigned. Never auto-Unpublish because a label was renamed.
      const configured = Object.keys(changes.shopBy || {}).length ? (await tx.get(ref("discoveryModules/shop-by-config"))).data() : null;
      const taxonomyReferences = [];
      for (const [dimension, values] of Object.entries(changes.shopBy || {})) {
        if (!Array.isArray(values)) fail("invalid-argument", 400);
        for (const value of values) {
          const definitions = await tx.get(db.collection("taxonomy").where("dimension", "==", dimension).where("name", "==", value).limit(2));
          const group = configured?.groups?.find(group => (group.key || group.id) === dimension && group.active !== false && group.values?.includes(value));
          if (definitions.size > 1 || definitions.size === 1 && definitions.docs[0].data().active === false || definitions.empty && !group) fail("taxonomy-unavailable", 409);
          taxonomyReferences.push(definitions.size === 1 ? { dimension, definitionId: definitions.docs[0].id, capturedLabel: value } : { dimension, configId: "shop-by-config", groupId: group.id || group.key, capturedLabel: value });
        }
      }
      if (action === "publish" && (state === "archived" || !productReadiness({ ...working, id, status: "published" }).ready || !normaliseProduct(id, { ...working, status: "published" }))) fail("publication-not-ready", 409);
      if (action === "unpublish" && state !== "published" || action === "restore" && state !== "archived") fail("stale-conflict", 409);
      const nextState = { create: "draft", publish: "published", unpublish: "unpublished", archive: "archived", restore: "unpublished" }[action] || state;
      const version = (prior?._version || 0) + 1;
      const next = { ...working, status: nextState, archived: nextState === "archived", _ownerVersion: 2, _version: version, _lastOperationId: input.operationId, updatedAt: now(), createdAt: prior?.createdAt || now() };
      if (changes.shopBy) next.taxonomyReferences = taxonomyReferences;
      if (prior?.publishedAt || prior?.firstPublishedAt) next.publishedAt = prior.publishedAt || prior.firstPublishedAt;
      if (action === "publish") { next.publicRepresentation = pick(working, PRODUCT_FIELDS); next.publicVersion = version; next.publishedAt ||= now(); }
      else if (prior?.status === "published" || prior?.publicRepresentation) { next.publicRepresentation = prior.publicRepresentation || pick(prior, PRODUCT_FIELDS); next.publicVersion = prior.publicVersion || prior._version || 0; }
      mediaCommit();
      tx.set(path, next, { merge: true });
      tx.create(ref(`productHistory/${input.operationId}`), { productId: id, version, action, actorStaffId: actor.staffId, createdAt: now(), commercialBefore: pick(prior, ["price", "unitLabel", "priceToken"]), commercialAfter: pick(working, ["price", "unitLabel", "priceToken"]) });
      tx.create(ref(`staffAudit/${input.operationId}`), { actorUid: claims.uid, actorStaffId: actor.staffId, execution: "staff", targetCollection: "products", targetId: id, action, outcome: "committed", createdAt: new Date(now()) });
      return operation.commit({ productId: id, version, lifecycle: nextState });
    });
  }
  async function target(tx, kind, id) {
    if (kind === "piece") return publicProduct(id, (await tx.get(productRef(id))).data());
    if (kind !== "review") fail("invalid-argument", 400);
    // Only the current public Review eligibility is consumed. No Review edits,
    // private media or consent semantics are implemented by the save owner.
    const modern = (await tx.get(ref(`accountReviews/${identifier(id)}`))).data(), legacy = (await tx.get(ref(`reviews/${id}`))).data();
    if (modern && legacy) fail("review-source-ambiguous", 503);
    const review = modern || legacy;
    if(modern){const order=(await tx.get(ref(`orders/${modern.orderId}`))).data(),base=(await tx.get(ref(`orders/${modern.orderId}/work/base`))).data();if(order?.accountId!==modern.authorAccountId||!base?.completed||!order.reviewEnabled||order.activeExtensionId)return null;}
    return reviewIsPublic(review) ? { id } : null;
  }
  async function listSaves(claims, kind) {
    if (!["piece", "review"].includes(kind)) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const owner = await customer(tx, claims);
      const rows = await tx.get(db.collection("customerContinuity").where("accountId", "==", owner.accountId).where("kind", "==", kind).limit(500));
      const records = [];
      for (const row of rows.docs) {
        const value = row.data(); if (!value.saved || value.accountId !== owner.accountId) continue;
        const current = await target(tx, kind, value.targetId);
        // Inaccessible targets contribute zero rows/counts/snippets.
        if (current) records.push({ targetId: value.targetId, version: value.version, ...(kind === "piece" ? { product: current } : {}) });
      }
      return { accountId: owner.accountId, epoch: owner.epoch, records };
    });
  }
  async function saveState(claims, kind, targetId) {
    identifier(targetId);
    if (!["piece", "review"].includes(kind)) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const owner = await customer(tx, claims);
      // Own relationship truth permits safe Unsave even if the target is now
      // hidden. This response contains no target content/existence assertion.
      const value = (await tx.get(relationshipRef(owner.accountId, kind, targetId))).data();
      return { accountId: owner.accountId, epoch: owner.epoch, version: value?.version || 0, saved: value?.saved === true };
    });
  }
  async function mutateSave(claims, input) {
    exactFields(input, ["operationId", "expectedEpoch", "expectedVersion", "kind", "targetId", "saved"]);
    if (!["piece", "review"].includes(input.kind) || typeof input.saved !== "boolean") fail("invalid-argument", 400);
    identifier(input.targetId);
    return db.runTransaction(async tx => {
      const owner = await customer(tx, claims);
      if (owner.epoch !== input.expectedEpoch) fail("stale-authority", 409);
      const path = relationshipRef(owner.accountId, input.kind, input.targetId), value = (await tx.get(path)).data();
      const operation = await receipt(tx, claims, input, "continuity.set", path.id, { kind: "customer", accountId: owner.accountId });
      if (operation.prior) return { state: "committed", ...operation.prior.result };
      if (input.saved && !await target(tx, input.kind, input.targetId)) fail("target-unavailable", 404);
      if ((value?.version || 0) !== input.expectedVersion) fail("stale-conflict", 409);
      const version = (value?.version || 0) + 1;
      tx.set(path, { accountId: owner.accountId, kind: input.kind, targetId: input.targetId, saved: input.saved, version, updatedAt: now(), source: value?.source || "customer" });
      return operation.commit({ version, saved: input.saved });
    });
  }
  async function importGuest(tx, owner, intent) {
    const kind = intent.kind === "saved-piece" ? "piece" : "review", path = relationshipRef(owner.accountId, kind, intent.objectId);
    const prior = (await tx.get(path)).data();
    if (!await target(tx, kind, intent.objectId)) return { state: "committed", skipped: true };
    // Positive import never erases an existing relation or changes target truth.
    if (!prior?.saved) tx.set(path, { accountId: owner.accountId, kind, targetId: intent.objectId, saved: true, version: (prior?.version || 0) + 1, source: "validated-guest-intent", updatedAt: now() });
    return { state: "committed" };
  }
  async function requestAuthority(tx, claims, request, action, sensitive = false) {
    if (claims._session?.kind === "staff" || claims.kind === "staff") {
      const actor = await resolveStaff(tx, db, claims, { capability: `customStyle.${action}`, purpose: "custom-style", objectId: request.requestId, action, state: "saved", assignedStaffId: request.assignedStaffId, ...(sensitive ? { dataClass: "custom-style-private" } : {}) }, now());
      return { kind: "staff", staffId: actor.staffId };
    }
    const owner = await customer(tx, claims);
    if (owner.accountId !== request.accountId) fail();
    return { kind: "customer", accountId: owner.accountId, epoch: owner.epoch };
  }
  async function readRequest(claims, requestId) {
    return db.runTransaction(async tx => {
      const value = (await tx.get(ref(`customStyleRequests/${identifier(requestId)}`))).data();
      if (!value) fail();
      const actor = await requestAuthority(tx, claims, value, "read", true);
      return { requestId: value.requestId, version: value.version, ...(actor.epoch ? { epoch: actor.epoch } : {}), fields: value.fields, source: value.source, mediaRefs: value.mediaRefs || [], handoff: value.handoff || null };
    });
  }
  async function mutateRequest(claims, input) {
    exactFields(input, ["operationId", "requestId", "expectedVersion", "expectedEpoch", "sourceProductId", "fields"]);
    const changes = fields(input.fields, REQUEST_FIELDS);
    if (changes.quantity != null && (!Number.isSafeInteger(changes.quantity) || changes.quantity < 1)) fail("invalid-argument", 400);
    const requestId = input.requestId ? identifier(input.requestId) : keyed(`request:${claims.uid}:${identifier(input.operationId)}`).slice(0, 40);
    return db.runTransaction(async tx => {
      const path = ref(`customStyleRequests/${requestId}`), prior = (await tx.get(path)).data();
      const owner = !input.requestId ? await customer(tx, claims) : null;
      const actor = owner ? { kind: "customer", accountId: owner.accountId, epoch: owner.epoch } : await requestAuthority(tx, claims, prior || { requestId }, "edit", true);
      if (actor.kind === "customer" && actor.epoch !== input.expectedEpoch) fail("stale-authority", 409);
      const operation = await receipt(tx, claims, input, "custom-style.save", requestId, actor);
      if (operation.prior) return { state: "committed", ...operation.prior.result };
      if (prior ? prior.version !== input.expectedVersion : input.requestId || input.expectedVersion !== 0) fail("stale-conflict", 409);
      if (prior && input.sourceProductId && input.sourceProductId !== prior.source?.productId) fail("invalid-argument", 400);
      let source = prior?.source || null;
      if (!prior && input.sourceProductId) {
        const product = await target(tx, "piece", identifier(input.sourceProductId));
        if (!product) fail("target-unavailable", 404);
        source = { productId: product.id, name: product.name, price: product.price, unitLabel: product.unitLabel, capturedAt: now() };
      }
      const version = (prior?.version || 0) + 1;
      tx.set(path, { requestId, accountId: prior?.accountId || owner.accountId, version, fields: { ...prior?.fields, ...changes }, source, mediaRefs: prior?.mediaRefs || [], createdAt: prior?.createdAt || now(), updatedAt: now() }, { merge: true });
      return operation.commit({ requestId, version });
    });
  }
  async function handoff(claims, input) {
    exactFields(input, ["operationId", "requestId", "expectedVersion", "expectedEpoch"]);
    return db.runTransaction(async tx => {
      const path = ref(`customStyleRequests/${identifier(input.requestId)}`), source = (await tx.get(path)).data();
      if (!source) fail();
      const actor = await requestAuthority(tx, claims, source, "handoff", true);
      if (actor.kind === "customer" && actor.epoch !== input.expectedEpoch) fail("stale-authority", 409);
      const operation = await receipt(tx, claims, input, "custom-style.handoff", source.requestId, actor);
      if (operation.prior) return { state: "committed", ...operation.prior.result };
      if (source.handoff) {
        if (!mainOrderOwner?.exists || !await mainOrderOwner.exists(source.handoff.orderId)) fail("handoff-outcome-unknown", 409);
        return { state: "committed", ...source.handoff };
      }
      if (source.version !== input.expectedVersion) fail("stale-conflict", 409);
      // Deliberately fail closed until the transaction owner is installed.
      // The port must read before writes and commit inside this same transaction.
      if (!mainOrderOwner?.prepare) fail("main-order-owner-unavailable", 503);
      const prepared = await mainOrderOwner.prepare(tx, { logicalId: keyed(`handoff:${source.requestId}`), source: structuredClone(source), actor, claims });
      if (!prepared?.commit || !prepared.orderId) fail("main-order-owner-unavailable", 503);
      const result = { orderId: identifier(prepared.orderId), sourceVersion: source.version, operationId: input.operationId };
      prepared.commit();
      tx.update(path, { handoff: result });
      tx.create(ref(`customStyleHandoffs/${source.requestId}`), { ...result, accountId: source.accountId, requestId: source.requestId, sourceSnapshot: source, actor, createdAt: now() });
      return operation.commit(result);
    });
  }
  async function reconcile(claims, operationId) {
    const operation = (await ref(`pretransactionOperations/${identifier(operationId)}`).get()).data();
    if (!operation || !await db.runTransaction(tx=>account.ownsResult(tx,claims,operation,operationId,"pretransaction"))) return { state: "unknown" };
    // Minimal owned result only. Private source payload and history never leak.
    if (operation.action === "custom-style.handoff") {
      if (!mainOrderOwner?.exists || !await mainOrderOwner.exists(operation.result.orderId)) return { state: "unknown" };
    }
    return { state: "committed", ...operation.result };
  }
  return { catalogue, mutateProduct, listSaves, saveState, mutateSave, importGuest, readRequest, mutateRequest, handoff, reconcile, requestAuthority, receipt, relationshipRef };
}
