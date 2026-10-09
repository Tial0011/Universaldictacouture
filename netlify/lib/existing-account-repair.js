import { randomUUID } from 'node:crypto';
import { createAccountService } from './account-service.js';
import { emailKey, identifier, fail } from './account-contract.js';
import { SUPER_ADMIN_PROFILE, OWNER_PROFILE, superAdminCapabilities } from '../../src/services/superAdminPolicy.js';

// Trusted operator tool only. Never exposed as a customer/staff API. Reads the
// exact Firebase UID; email equality cannot transfer somebody else's identity.
export function createExistingAccountRepair(runtime) {
  const service = createAccountService(runtime), { db, ref, keyed, now } = service;
  const actor = { kind: 'owner-authorized-repair', reference: 'existing-account-continuity-2026-10-09' };
  async function customer(uid, { commit = false } = {}) {
    identifier(uid);
    const provider = await runtime.auth.getUser(uid);
    if (provider.disabled || !provider.email) return { state: 'ineligible' };
    const loginKey = emailKey(provider.email, runtime.secret), accountId = randomUUID();
    return db.runTransaction(async tx => {
      const [binding, claim, legacy, previous] = await Promise.all([
        tx.get(ref(`accountBindings/${uid}`)), tx.get(ref(`accountLoginClaims/${loginKey}`)),
        tx.get(ref(`customerProfiles/${uid}`)), tx.get(db.collection('accounts').where('principalUid','==',uid).limit(2)),
      ]);
      if (binding.exists) {
        const current = binding.data().accountId && (await tx.get(ref(`accounts/${identifier(binding.data().accountId)}`))).data();
        if (!current || current.principalUid !== uid || current.accountId !== binding.data().accountId || current.epoch !== binding.data().epoch) fail('account-binding-ambiguous');
        // Restricted/deleted/merged identities are deliberately never restored.
        return { state: 'already-bound', accountId: current.accountId };
      }
      if (claim.exists || previous.size || legacy.data()?.accountId || legacy.data()?.lifecycle || legacy.data()?.deleted === true) fail('account-binding-ambiguous');
      if (!commit) return { state: 'would-bind' };
      service.initialize(tx, { accountId, uid, loginKey, createdBy: actor });
      const fields = { profilePhoto: null, fullName: '', preferredName: '', phoneNumber: '', publicDisplayName: '' };
      for (const key of ['fullName','preferredName','phoneNumber','publicDisplayName']) {
        if (typeof legacy.data()?.[key] === 'string' && legacy.data()[key].length <= 1000) fields[key] = legacy.data()[key].trim();
      }
      tx.update(ref(`accounts/${accountId}`), { emailControlConfirmed: provider.emailVerified === true });
      tx.update(ref(`customerProfiles/${accountId}`), { fields });
      tx.create(ref(`accountLoginClaims/${loginKey}`), { accountId, uid, state: 'bound' });
      tx.create(ref(`identityMigrationEvidence/${keyed('customer-repair:' + uid)}`), {
        actor, principalUid: uid, accountId, historicalOwnerReference: uid, createdAt: now(),
      });
      return { state: 'bound', accountId };
    });
  }
  async function admin(uid, { commit = false, paymentReview = false, owner = false } = {}) {
    identifier(uid);
    const provider = await runtime.auth.getUser(uid);
    if (provider.disabled) return { state: 'ineligible' };
    const candidate = randomUUID();
    return db.runTransaction(async tx => {
      const memberRef = ref(`admins/${uid}`), raw = (await tx.get(memberRef)).data();
      if (!raw || raw.active !== true || raw.sharedAccount === true || raw.principalUids?.length > 1) return { state: 'ineligible' };
      const staffId = raw.staffId ? identifier(raw.staffId) : candidate;
      const identityRef = ref(`staffIdentities/${staffId}`), identity = (await tx.get(identityRef)).data();
      const other = await tx.get(db.collection('admins').where('staffId','==',staffId).limit(2));
      if (other.docs.some(row => row.id !== uid) || identity && (identity.active !== true || identity.staffId !== staffId || identity.principalUid !== uid || identity.principalUids?.length > 1)) fail('staff-binding-ambiguous');
      const receiptRef = ref(`identityMigrationEvidence/${keyed('super-admin-repair:' + uid)}`);
      const receipt = (await tx.get(receiptRef)).data();
      const ownerRef=ref(`staffOwners/${uid}`), ownerRecord=(await tx.get(ownerRef)).data();
      if(ownerRecord && (!owner || ownerRecord.staffId!==staffId)) fail('owner-repair-review-required');
      const accessProfile=owner?OWNER_PROFILE:SUPER_ADMIN_PROFILE;
      if (raw.accessProfile === accessProfile && identity && raw.paymentReview === paymentReview && (!owner || ownerRecord?.active===true)) return { state: 'already-promoted', staffId };
      if (receipt) fail('staff-repair-review-required'); // do not overwrite a subsequent governance change on replay
      if (!commit) return { state: 'would-promote' };
      if (!identity) tx.create(identityRef, { staffId, principalUid: uid, active: true, createdAt: now() });
      if(owner&&!ownerRecord)tx.create(ownerRef,{principalUid:uid,staffId,active:true,createdAt:now(),actor});
      tx.update(memberRef, { staffId, role: owner?'Owner':'Super Admin', accessProfile, paymentReview, accessVersion:1, disabledCapabilities:[], adminContactEmail:provider.email||'',
        capabilities: { ...raw.capabilities, ...superAdminCapabilities({ paymentReview }) } });
      tx.create(receiptRef, { actor, principalUid: uid, staffId, createdAt: now(), previousMembership: raw, paymentReview });
      return { state: 'promoted', staffId };
    });
  }
  return { customer, admin };
}
