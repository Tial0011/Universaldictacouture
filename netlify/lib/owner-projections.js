import { AccountError, fail, identifier } from "./account-contract.js";
import { publicProduct } from "./pretransaction-service.js";
import { resolveStaff, resolveStaffIdentity } from "./staff-authority.js";
import { authorizationRoutes } from "../../src/services/staffAuthorization.js";

export function createOwnerProjections(account) {
  const { db, ref, now } = account;
  // Baseline and write share a transaction: an overlapping source edit causes
  // a retry. Never accept an event's stale snapshot as the rebuild baseline.
  async function rebuildProduct(productId) {
    identifier(productId);
    return db.runTransaction(async tx => {
      const source = (await tx.get(ref(`products/${productId}`))).data(), product = publicProduct(productId, source);
      const path = ref(`productReadModels/${productId}`);
      if (!product) tx.delete(path);
      else tx.set(path, { productId, sourceVersion: product.publicVersion, label: product.name, observedAt: now() });
      return { state: "reconciled", visible: Boolean(product) };
    });
  }
  async function publicSearch(term = "") {
    if (typeof term !== "string" || term.length > 200) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const candidates = await tx.get(db.collection("productReadModels").limit(200)), records = [];
      for (const candidate of candidates.docs) {
        const product = publicProduct(candidate.id, (await tx.get(ref(`products/${candidate.id}`))).data());
        if (product && product.name.toLocaleLowerCase().includes(term.toLocaleLowerCase())) records.push({ productId: product.id, label: product.name, publicVersion: product.publicVersion });
      }
      // An index miss is not proof a source is absent. There is not yet a
      // verified whole-catalogue baseline/cursor, so never claim completeness.
      return { records, count: records.length, complete: false, source: "current-products", partialReason: "index-coverage-unverified" };
    });
  }
  async function staffOrders(claims, term = "") {
    if (typeof term !== "string" || term.length > 200) fail("invalid-argument", 400);
    return db.runTransaction(async tx => {
      const staff = await resolveStaffIdentity(tx, db, claims, now());
      if (!authorizationRoutes(staff, "orders.read", "order-operations").some(route =>
        (!route.actions || route.actions.includes("read")) && (route.family === "domainWide" || route.family === "selectedObject" && route.ids?.length || route.family === "assignmentDerived" && staff.functionAsCouturier && staff.eligible))) fail();
      const sources = await tx.get(db.collection("orders").limit(100)), records = [];
      for (const row of sources.docs) {
        const order = row.data(); if (order._ownerVersion !== 3) continue;
        try {
          await resolveStaff(tx, db, claims, { capability: "orders.read", purpose: "order-operations", objectId: row.id, assignedStaffId: order.assignedStaffId, state: order.status, action: "read" }, now());
        } catch (error) {
          if (error instanceof AccountError && [401, 403].includes(error.status)) continue;
          throw error;
        }
        if (`${row.id} ${order.status}`.toLocaleLowerCase().includes(term.toLocaleLowerCase())) records.push({ orderId: row.id, status: order.status, currentWork: order.currentWork });
      }
      // Do not expose the candidate scan count, cursor or hidden existence.
      return { records, count: records.length, complete: false, source: "current-orders" };
    });
  }
  return { rebuildProduct, publicSearch, staffOrders };
}
