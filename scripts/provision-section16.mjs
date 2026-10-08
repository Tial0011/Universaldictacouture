// Controlled reviewed migration. Default dry-run. Never reads/writes transactions
// or infers human/Customer identity from email equality. Not a public endpoint.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { accountRuntime } from '../netlify/lib/firebase-admin-runtime.js';
import { createAccountService } from '../netlify/lib/account-service.js';
import { emailKey, exactFields, identifier, profileFields } from '../netlify/lib/account-contract.js';
import { SCOPE_FAMILIES } from '../src/services/staffAuthorization.js';

export async function provisionSection16(runtime, manifest, { commit = false } = {}) {
  exactFields(manifest, ['ownerReviewReference', 'customers', 'staff']);
  if (typeof manifest.ownerReviewReference !== 'string' || !manifest.ownerReviewReference.trim()) throw Error('An explicit owner-review reference is required.');
  if (!Array.isArray(manifest.customers) || !Array.isArray(manifest.staff)) throw Error('Reviewed customer/staff arrays are required.');
  const service = createAccountService(runtime), humanRefs = new Set(), subjects = new Set(), durableIds = new Set();
  for (const item of manifest.customers) {
    exactFields(item, ['uid', 'accountId', 'profile']); identifier(item.uid); identifier(item.accountId);
    if (item.uid === item.accountId || subjects.has(item.uid) || durableIds.has(item.accountId)) throw Error('A reviewed distinct durable identity and unique provider binding are required.');
    subjects.add(item.uid); durableIds.add(item.accountId); if (item.profile) profileFields(item.profile);
  }
  subjects.clear(); durableIds.clear();
  for (const item of manifest.staff) {
    exactFields(item, ['uid', 'staffId', 'humanRef', 'capabilities', 'functionAsCouturier', 'eligible', 'available']); identifier(item.uid); identifier(item.staffId); identifier(item.humanRef);
    if (subjects.has(item.uid) || durableIds.has(item.staffId) || humanRefs.has(item.humanRef)) throw Error('One reviewed human must have one Staff identity/provider binding.');
    subjects.add(item.uid); durableIds.add(item.staffId); humanRefs.add(item.humanRef);
    if (!item.capabilities || typeof item.capabilities !== 'object' || Array.isArray(item.capabilities)) throw Error('Explicit reviewed capabilities are required, never inferred from roles.');
    for (const grant of Object.values(item.capabilities)) {
      exactFields(grant, SCOPE_FAMILIES);
      for (const route of Object.values(grant)) if (!route || typeof route.active !== 'boolean' || typeof route.purpose !== 'string' || !route.purpose) throw Error('Review every complete capability route, including revoked grants.');
    }
  }
  const actor = { kind: 'system-provisioner', ownerReviewReference: manifest.ownerReviewReference };
  for (const item of manifest.customers) {
    const provider = await runtime.auth.getUser(item.uid);
    if (provider.disabled || !provider.email) throw Error('An eligible exact provider principal is required.');
    const loginKey = emailKey(provider.email, runtime.secret);
    await runtime.db.runTransaction(async tx => {
      const [binding, account, claim] = await Promise.all([tx.get(service.ref('accountBindings/' + item.uid)), tx.get(service.ref('accounts/' + item.accountId)), tx.get(service.ref('accountLoginClaims/' + loginKey))]);
      if (binding.exists || account.exists || claim.exists) {
        if (binding.data()?.accountId !== item.accountId || account.data()?.principalUid !== item.uid || claim.data()?.accountId !== item.accountId || !['ACTIVE', 'RESTORED'].includes(account.data()?.lifecycle)) throw Error('Existing identity conflict needs its owning protected resolution, not migration guessing.');
        return;
      }
      if (!commit) return;
      service.initialize(tx, { accountId: item.accountId, uid: item.uid, loginKey, createdBy: actor });
      tx.update(service.ref('accounts/' + item.accountId), { emailControlConfirmed: provider.emailVerified === true });
      if (item.profile) tx.update(service.ref('customerProfiles/' + item.accountId), { fields: { profilePhoto: null, fullName: '', preferredName: '', phoneNumber: '', publicDisplayName: '', ...profileFields(item.profile) } });
      tx.create(service.ref('accountLoginClaims/' + loginKey), { accountId: item.accountId, uid: item.uid, state: 'bound' });
      tx.create(service.ref('identityMigrationEvidence/' + service.keyed('customer:' + item.uid + ':' + item.accountId)), { actor, providerUid: item.uid, accountId: item.accountId, historicalOwnerReference: item.uid, createdAt: Date.now() });
    });
  }
  for (const item of manifest.staff) {
    const provider = await runtime.auth.getUser(item.uid); if (provider.disabled) throw Error('Offboarded provider principals are not migration candidates.');
    await runtime.db.runTransaction(async tx => {
      const memberRef = service.ref('admins/' + item.uid), identityRef = service.ref('staffIdentities/' + item.staffId), humanRef = service.ref('staffHumanBindings/' + service.keyed(item.humanRef));
      const [membership, identity, human] = await Promise.all([tx.get(memberRef), tx.get(identityRef), tx.get(humanRef)]);
      const raw = membership.data();
      if (!raw || raw.active !== true || raw.sharedAccount === true) throw Error('Only existing legitimate active individual memberships may be migrated.');
      if ((raw.staffId && raw.staffId !== item.staffId) || (identity.exists && identity.data().principalUid !== item.uid) || (human.exists && human.data().staffId !== item.staffId)) throw Error('Ambiguous Staff identity requires protected review.');
      if (raw.capabilities && JSON.stringify(raw.capabilities) !== JSON.stringify(item.capabilities)) throw Error('Canonical capabilities are preserved; use the owning governance workflow for changes.');
      if (!commit) return;
      tx.set(identityRef, { staffId: item.staffId, principalUid: item.uid, humanRef: item.humanRef, active: true });
      tx.set(humanRef, { staffId: item.staffId, principalUid: item.uid });
      tx.set(memberRef, { ...raw, staffId: item.staffId, capabilities: raw.capabilities || item.capabilities, functionAsCouturier: item.functionAsCouturier === undefined ? raw.functionAsCouturier === true : item.functionAsCouturier === true, eligible: item.eligible === undefined ? raw.eligible === true : item.eligible === true, available: item.available === undefined ? raw.available === true : item.available === true });
      tx.set(service.ref('identityMigrationEvidence/' + service.keyed('staff:' + item.uid + ':' + item.staffId)), { actor, principalUid: item.uid, staffId: item.staffId, previousDevelopmentAlias: 'legacy-dev:' + item.uid, createdAt: Date.now() });
    });
  }
  return { mode: commit ? 'committed' : 'dry-run', customers: manifest.customers.length, staff: manifest.staff.length, protectedHistoryRewritten: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = process.argv[process.argv.indexOf('--input') + 1]; if (!process.argv.includes('--input') || !input) throw Error('Provide a protected reviewed manifest with --input.');
    const bytes = await readFile(input), hash = createHash('sha256').update(bytes).digest('hex');
    const commit = process.argv.includes('--commit');
    if (commit && process.env.UDC_PROVISION_APPROVAL_SHA256 !== hash) throw Error('Commit requires the exact externally approved manifest SHA256 in UDC_PROVISION_APPROVAL_SHA256.');
    const result = await provisionSection16(accountRuntime(), JSON.parse(bytes.toString('utf8')), { commit });
    console.log(JSON.stringify({ ...result, manifestSha256: hash })); // no PII, credentials or private membership data
  } catch { console.error('Reviewed provisioning could not complete. No speculative history migration is permitted. Reconcile any previously committed rows before retry.'); process.exitCode = 1; }
}
