import { exactFields, fail, identifier } from './account-contract.js';
import { resolveStaff, resolveStaffIdentity } from './staff-authority.js';
import { authorizationRoutes } from '../../src/services/staffAuthorization.js';

export const TAXONOMY_FAMILIES = Object.freeze(['occasion', 'style', 'fabric']);
export const normalizeTaxonomyLabel = label => label.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
export function createTaxonomyGovernance(account) {
  const { db, ref, keyed, now } = account;
  const record = id => ref(`taxonomy/${identifier(id)}`);
  const claim = (dimension, name) => ref(`taxonomyLabelClaims/${keyed(JSON.stringify([dimension, normalizeTaxonomyLabel(name)]))}`);
  const authorize = (tx, claims, id, action) => resolveStaff(tx, db, claims, { capability: `settings.taxonomy.${action}`, purpose: 'taxonomy-settings', objectId: id, action }, now());
  const projection = row => ({ id: row.id, name: row.data().name, dimension: row.data().dimension, active: row.data().active !== false, order: row.data().order || 0, version: row.data()._version || 0 });
  async function list(claims, after) {
    if (after) identifier(after);
    return db.runTransaction(async tx => {
      const staff = await resolveStaffIdentity(tx, db, claims, now());
      if (!authorizationRoutes(staff, 'settings.taxonomy.read', 'taxonomy-settings').some(route => (!route.actions || Array.isArray(route.actions) && route.actions.includes('read')) && (route.family === 'domainWide' || route.family === 'selectedObject' && Array.isArray(route.ids) && route.ids.length))) fail();
      let query = db.collection('taxonomy').orderBy('__name__').limit(41);
      if (after) query = query.startAfter(after);
      const rows = await tx.get(query), records = [];
      for (const row of rows.docs.slice(0, 40)) {
        if (!TAXONOMY_FAMILIES.includes(row.data().dimension)) continue;
        try { await authorize(tx, claims, row.id, 'read'); records.push(projection(row)); }
        catch (error) { if (error.status !== 403) throw error; }
      }
      // Taxonomy definitions/IDs are public; history and operation receipts are protected.
      return { records, next: rows.size > 40 ? rows.docs[39].id : null };
    });
  }
  async function read(claims, id) {
    return db.runTransaction(async tx => {
      await authorize(tx, claims, id, 'read');
      const row = await tx.get(record(id)); if (!row.exists) fail('not-found', 404);
      return projection(row);
    });
  }
  async function mutate(claims, input) {
    exactFields(input, ['operationId', 'id', 'expectedVersion', 'action', 'name', 'dimension', 'order']);
    identifier(input.operationId);
    if (!['create', 'rename', 'reorder', 'deactivate', 'reactivate'].includes(input.action)) fail('invalid-argument', 400);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) fail('invalid-argument', 400);
    const id = input.action === 'create' ? keyed(`taxonomy:${claims.uid}:${input.operationId}`).slice(0, 40) : identifier(input.id);
    return db.runTransaction(async tx => {
      await authorize(tx, claims, id, 'read');
      const staff = await authorize(tx, claims, id, 'edit');
      const path = record(id), row = await tx.get(path), prior = row.data();
      const receiptPath = ref(`taxonomyOperations/${input.operationId}`), receipt = (await tx.get(receiptPath)).data();
      const fingerprint = keyed(JSON.stringify({ uid: claims.uid, input }));
      if (receipt) { if (receipt.actorUid !== claims.uid || receipt.fingerprint !== fingerprint) fail('operation-conflict', 409); return { state: 'committed', ...receipt.result }; }
      if (input.action === 'create' ? prior || input.expectedVersion !== 0 : !prior || (prior._version || 0) !== input.expectedVersion) fail('stale-conflict', 409);
      const dimension = prior?.dimension || input.dimension;
      if (!TAXONOMY_FAMILIES.includes(dimension) || prior && input.dimension != null && input.dimension !== dimension) fail('invalid-argument', 400);
      const name = ['create', 'rename'].includes(input.action) ? input.name : prior.name;
      if (typeof name !== 'string' || !name.trim() || name.length > 160 || (/[<>]/.test(name) || Array.from(name).some(character => character.charCodeAt(0) < 32))) fail('invalid-argument', 400);
      const order = ['create', 'reorder'].includes(input.action) ? input.order ?? 0 : prior.order || 0;
      if (!Number.isSafeInteger(order) || order < 0 || order > 100000) fail('invalid-argument', 400);
      const active = input.action === 'deactivate' ? false : input.action === 'reactivate' || input.action === 'create' ? true : prior.active !== false;
      const nextClaim = claim(dimension, name), claimed = (await tx.get(nextClaim)).data();
      const oldClaim = prior ? claim(dimension, prior.name) : null, old = oldClaim ? (await tx.get(oldClaim)).data() : null;
      if (active) {
        if (claimed && claimed.id !== id) fail('taxonomy-label-conflict', 409);
        const legacy = await tx.get(db.collection('taxonomy').where('dimension', '==', dimension).limit(201));
        if (legacy.size > 200) fail('taxonomy-source-unavailable', 503);
        if (legacy.docs.some(candidate => candidate.id !== id && candidate.data().active !== false && normalizeTaxonomyLabel(candidate.data().name || '') === normalizeTaxonomyLabel(name))) fail('taxonomy-label-conflict', 409);
      }
      const version = (prior?._version || 0) + 1, actor = { kind: 'staff', staffId: staff.staffId };
      const result = { id, version, active, action: input.action };
      if (old?.id === id && (!active || oldClaim.path !== nextClaim.path)) tx.delete(oldClaim);
      if (active) tx.set(nextClaim, { id, dimension });
      tx.set(path, { name: name.trim(), dimension, active, order, _version: version, _lastOperationId: input.operationId, createdAt: prior?.createdAt || now(), updatedAt: now() }, { merge: true });
      tx.create(path.collection('history').doc(input.operationId), { action: input.action, version, actor, at: now(), previous: prior ? { name: prior.name, active: prior.active !== false, order: prior.order || 0 } : null, current: { name: name.trim(), active, order } });
      tx.create(receiptPath, { actorUid: claims.uid, actor, fingerprint, result, state: 'committed', createdAt: now() });
      account.capture(tx, { domain: 'taxonomy', operationId: input.operationId, action: input.action, target: id, actor, executor: 'system:taxonomy-api' });
      return { state: 'committed', ...result };
    });
  }
  async function reconcile(claims, operationId) {
    identifier(operationId);
    return db.runTransaction(async tx => {
      const receipt = (await tx.get(ref(`taxonomyOperations/${operationId}`))).data();
      if (!await account.ownsResult(tx, claims, receipt, operationId, 'taxonomy')) return { state: 'unknown' };
      await authorize(tx, claims, receipt.result.id, 'read');
      return { state: 'committed', ...receipt.result };
    });
  }
  return { list, read, mutate, reconcile };
}
