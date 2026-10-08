import sharp from "sharp";
import { exactFields, fail, identifier } from "./account-contract.js";
import { resolveStaff } from "./staff-authority.js";
import { MAX_IMAGE_BYTES } from "./image-storage.js";

// This private store is deliberately different from legacy public catalogue
// uploads. No object locator/derivative bypasses its owning relationship.
export function createMediaService(account, cluster, { getPrivateStore } = {}) {
  const { db, ref, now, keyed } = account;
  const path = id => ref(`mediaAssets/${identifier(id)}`);
  async function context(tx, claims, input, action) {
    if (input.domain === "product") {
      const ownerRef = ref(`products/${identifier(input.objectId)}`), owner = (await tx.get(ownerRef)).data();
      if (!owner || owner.status === "archived") fail();
      const actor = await resolveStaff(tx, db, claims, { capability: "products.media", purpose: "catalogue", objectId: input.objectId, state: owner.status, action }, now());
      return { ownerRef, owner, version: owner._version || 0, identity: { kind: "staff", staffId: actor.staffId } };
    }
    if (input.domain === "custom-style") {
      const ownerRef = ref(`customStyleRequests/${identifier(input.objectId)}`), owner = (await tx.get(ownerRef)).data();
      if (!owner) fail();
      const actor = await cluster.requestAuthority(tx, claims, owner, action === "read" ? "read" : "edit", true);
      return { ownerRef, owner, version: owner.version, identity: actor };
    }
    // Payment Proof/Chat/Review attachments require their dedicated owner port.
    // Generic assignment or Admin presence can never grant these data classes.
    fail("media-owner-unavailable", 503);
  }
  async function stage(claims, input) {
    exactFields(input, ["operationId", "domain", "objectId", "expectedVersion", "expectedEpoch", "contentType", "base64"]);
    identifier(input.operationId); identifier(input.objectId);
    if (!getPrivateStore) fail("media-source-unavailable", 503);
    const types = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" };
    if (!types[input.contentType] || typeof input.base64 !== "string" || input.base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)) fail("invalid-media", 415);
    // Authorize before expensive decoding/storage. Revalidate after processing.
    await db.runTransaction(async tx => {
      const current = await context(tx, claims, input, "upload");
      if (current.version !== input.expectedVersion || current.identity.epoch && current.identity.epoch !== input.expectedEpoch) fail("stale-conflict", 409);
    });
    const bytes = Buffer.from(input.base64, "base64");
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) fail("invalid-media", 413);
    let output;
    try {
      const image = sharp(bytes, { limitInputPixels: 40000000, failOn: "warning" });
      const meta = await image.metadata();
      if (meta.format !== types[input.contentType] || (meta.pages || 1) > 1) fail("invalid-media", 415);
      output = await image.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    } catch { fail("invalid-media", 415); }
    const assetId = keyed(`asset:${claims.uid}:${input.operationId}`), blobKey = `private-${assetId}.webp`;
    const fingerprint = keyed(JSON.stringify({ ...input, base64: keyed(input.base64), uid: claims.uid }));
    const reserved = await db.runTransaction(async tx => {
      const current = await context(tx, claims, input, "upload"), previous = (await tx.get(path(assetId))).data();
      if (previous) {
        if (previous.fingerprint !== fingerprint || previous.purgeState) fail("operation-conflict", 409);
        return previous;
      }
      if (current.version !== input.expectedVersion || current.identity.epoch && current.identity.epoch !== input.expectedEpoch) fail("stale-conflict", 409);
      const value = { assetId, blobKey, fingerprint, actorUid: claims.uid, originalActor: current.identity, domain: input.domain, objectId: input.objectId, expectedVersion: input.expectedVersion, expectedEpoch: input.expectedEpoch ?? null, state: "upload-pending", everAttached: false, createdAt: now() };
      tx.create(path(assetId), value); return value;
    });
    if (reserved.state !== "validated") {
      // Same immutable bytes/key for retry; no content-hash sharing across Accounts.
      await getPrivateStore().set(blobKey, output);
      await db.runTransaction(async tx => {
        const asset = (await tx.get(path(assetId))).data();
        if (!asset || asset.purgeState || asset.fingerprint !== fingerprint) fail("stale-conflict", 409);
        tx.update(path(assetId), { state: "validated" });
      });
    }
    return { state: "staged", assetId }; // Uploaded bytes are not a saved request.
  }
  async function attach(claims, input) {
    exactFields(input, ["operationId", "domain", "objectId", "expectedVersion", "expectedEpoch", "assetIds"]);
    if (!Array.isArray(input.assetIds) || input.assetIds.length > 8 || new Set(input.assetIds).size !== input.assetIds.length) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const current = await context(tx, claims, input, "attach");
      const operation = await cluster.receipt(tx, claims, input, "media.attach", input.objectId, current.identity);
      if (operation.prior) return { state: "committed", ...operation.prior.result };
      if (current.version !== input.expectedVersion || current.identity.epoch && current.identity.epoch !== input.expectedEpoch) fail("stale-conflict", 409);
      const assets = [];
      for (const assetId of input.assetIds) {
        const asset = (await tx.get(path(assetId))).data();
        if (!asset || asset.purgeState || asset.state !== "validated" || asset.actorUid !== claims.uid || asset.domain !== input.domain || asset.objectId !== input.objectId || asset.expectedVersion !== input.expectedVersion || asset.expectedEpoch !== (input.expectedEpoch ?? null)) fail();
        assets.push(asset);
      }
      const oldRefs = await tx.get(db.collection("mediaReferences").where("domain", "==", input.domain).where("objectId", "==", input.objectId));
      const version = current.version + 1;
      const refs = assets.map(asset => keyed(JSON.stringify([input.domain, input.objectId, asset.assetId, input.operationId])));
      assets.forEach((asset, index) => {
        tx.create(ref(`mediaReferences/${refs[index]}`), { referenceId: refs[index], assetId: asset.assetId, domain: input.domain, objectId: input.objectId, active: true, createdAt: now() });
        tx.update(path(asset.assetId), { everAttached: true });
      });
      for (const old of oldRefs.docs) if (old.data().active) tx.update(old.ref, { active: false, detachedAt: now() });
      if (input.domain === "product") {
        const images = refs.map(referenceId => ({ referenceId, url: `/.netlify/functions/account?action=public-media&referenceId=${referenceId}`, alt: "" }));
        const oldPublic = current.owner.publicRepresentation || (current.owner.status === "published" ? Object.fromEntries(Object.entries(current.owner).filter(([key]) => !key.startsWith('_') && !['status', 'archived'].includes(key))) : null);
        tx.update(current.ownerRef, { images, primaryImage: images[0] || null, _ownerVersion: 2, _version: version, ...(oldPublic ? { publicRepresentation: oldPublic } : {}) });
      } else tx.update(current.ownerRef, { mediaRefs: refs, version });
      return operation.commit({ version, referenceIds: refs });
    });
  }
  async function deliver(claims, referenceId, { publicOnly = false, thumbnail = false } = {}) {
    if (!getPrivateStore) fail("media-source-unavailable", 503);
    const authorize = () => db.runTransaction(async tx => {
      const reference = (await tx.get(ref(`mediaReferences/${identifier(referenceId)}`))).data();
      if (!reference) fail();
      const current = (await tx.get(path(reference.assetId))).data();
      if (!current || current.purgeState) fail();
      if (publicOnly) {
        if (reference.domain !== "product") fail();
        const product = (await tx.get(ref(`products/${reference.objectId}`))).data();
        if (product?.status !== "published" || product.archived === true || !product.publicRepresentation?.images?.some(image => image.referenceId === referenceId)) fail();
      } else {
        if (!reference.active) fail();
        const owner = await context(tx, claims, reference, "read");
        if (reference.domain === "custom-style" && !owner.owner.mediaRefs?.includes(referenceId)) fail();
        if (reference.domain === "product" && !owner.owner.images?.some(image => image.referenceId === referenceId)) fail();
      }
      return current;
    });
    const asset = await authorize();
    const bytes = await getPrivateStore().get(asset.blobKey, { type: "arrayBuffer", consistency: "strong" });
    if (!bytes) fail("media-source-unavailable", 503);
    // Derivatives use precisely the same authorization decision, never a public
    // derivative bucket or long-lived bearer URL.
    const output = thumbnail ? await sharp(Buffer.from(bytes)).resize({ width: 320, withoutEnlargement: true }).webp().toBuffer() : bytes;
    const current = await authorize();
    if (current.assetId !== asset.assetId || current.blobKey !== asset.blobKey) fail();
    return output;
  }
  async function purgeStaged(assetId) {
    if (!getPrivateStore) fail("media-source-unavailable", 503);
    const asset = await db.runTransaction(async tx => {
      const value = (await tx.get(path(assetId))).data();
      if (!value || value.everAttached || value.state === "upload-pending") fail("retention-owner-required", 409);
      const references = await tx.get(db.collection("mediaReferences").where("assetId", "==", assetId).limit(1));
      if (!references.empty) fail("retention-owner-required", 409);
      if (value.purgeState === "purged") return value;
      // Lock the asset against reattachment before irreversible storage deletion.
      tx.update(path(assetId), { purgeState: "purging" }); return value;
    });
    if (asset.purgeState !== "purged") {
      await getPrivateStore().delete(asset.blobKey);
      await path(assetId).update({ purgeState: "purged", purgedAt: now() });
    }
    return { state: "purged", executor: "system:staged-media-cleanup" };
  }
  async function prepareProductReferences(tx, claims, input) {
    if (input.images.length > 8) fail("invalid-argument", 400);
    const images = [], attachments = [];
    for (const image of input.images) {
      if (image.assetId) {
        const asset = (await tx.get(path(image.assetId))).data();
        if (!asset || asset.actorUid !== claims.uid || asset.domain !== "product" || asset.objectId !== input.productId || asset.expectedVersion !== input.expectedVersion || asset.purgeState || asset.state !== "validated") fail();
        const referenceId = keyed(JSON.stringify(["product", input.productId, asset.assetId, input.operationId]));
        attachments.push({ asset, referenceId });
        images.push({ referenceId, url: `/.netlify/functions/account?action=public-media&referenceId=${referenceId}`, alt: typeof image.alt === "string" ? image.alt.slice(0, 250) : "" });
      } else if (image.referenceId) {
        const reference = (await tx.get(ref(`mediaReferences/${identifier(image.referenceId)}`))).data();
        const asset = reference ? (await tx.get(path(reference.assetId))).data() : null;
        if (!reference?.active || reference.domain !== "product" || reference.objectId !== input.productId || !asset || asset.purgeState) fail();
        images.push({ referenceId: reference.referenceId, url: `/.netlify/functions/account?action=public-media&referenceId=${reference.referenceId}`, alt: typeof image.alt === "string" ? image.alt.slice(0, 250) : "" });
      } else {
        // Existing explicitly public legacy images stay public, never reused as
        // private inspiration. Their retention migration requires owner review.
        images.push(image);
      }
    }
    const previous = await tx.get(db.collection("mediaReferences").where("domain", "==", "product").where("objectId", "==", input.productId));
    return { images, commit() {
      for (const { asset, referenceId } of attachments) {
        tx.create(ref(`mediaReferences/${referenceId}`), { referenceId, assetId: asset.assetId, domain: "product", objectId: input.productId, active: true, createdAt: now() });
        tx.update(path(asset.assetId), { everAttached: true });
      }
      for (const old of previous.docs) if (old.data().active && !images.some(image => image.referenceId === old.id)) tx.update(old.ref, { active: false, detachedAt: now() });
    } };
  }
  return { stage, attach, deliver, purgeStaged, prepareProductReferences };
}
