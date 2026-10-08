import { randomUUID } from "node:crypto";
import { emailKey, exactFields, fail, identifier, requireFresh, RESOLUTIONS } from "./account-contract.js";
import { resolveStaff } from "./staff-authority.js";

export function createIdentityResolution(service) {
  const { db, auth, ref, secret, keyed, now, initialize, defaults } = service;
  async function intake(claims, input) {
    exactFields(input, ["operationId"]); identifier(input.operationId);
    const provider = await auth.getUser(claims.uid);
    if (!provider.email || provider.disabled) fail();
    const loginKey = emailKey(provider.email, secret), caseId = keyed(loginKey + ":" + claims.uid);
    await db.runTransaction(async tx => {
      const [claim, binding, prior] = await Promise.all([tx.get(ref(`accountLoginClaims/${loginKey}`)), tx.get(ref(`accountBindings/${claims.uid}`)), tx.get(ref(`identityConflicts/${caseId}`))]);
      if (binding.data()?.active === true) fail("binding-already-established", 409);
      if (prior.exists) return;
      if (!claim.exists || !claim.data().accountId) fail("reviewed-migration-required", 409);
      const original = (await tx.get(ref(`accounts/${claim.data().accountId}`))).data(); if (!original) fail();
      tx.create(ref(`identityConflicts/${caseId}`), { caseId, prospectiveUid: claims.uid, loginKey, originalAccountId: original.accountId, originalVersion: original.version, state: "open", version: 1, createdAt: now() });
    });
    return { state: "assistance-required" }; // No case ID, original identity or reasons disclosed publicly.
  }
  async function resolve(claims, input) {
    exactFields(input, ["caseId", "operationId", "expectedVersion", "outcome", "canonicalAccountId", "reason"]);
    const caseId = identifier(input.caseId), operationId = identifier(input.operationId);
    if (!RESOLUTIONS.includes(input.outcome) || typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 1000) fail("invalid-argument", 400);
    const actions = { "RESTORE ORIGINAL ACCOUNT": "restore", "ALLOW NEW ACCOUNT AFTER REVIEW": "allow-new", "RESTRICT REGISTRATION": "restrict-registration", "RARE MERGE": "rare-merge" };
    const fingerprint = keyed(JSON.stringify(input)), newAccountId = randomUUID();
    const candidateCase = (await ref(`identityConflicts/${caseId}`).get()).data();
    await db.runTransaction(tx => resolveStaff(tx, db, claims, { capability: `identity.${actions[input.outcome]}`, purpose: "identity-resolution", governanceArea: "identity-resolution", objectId: caseId, action: actions[input.outcome], state: candidateCase?.state || "unavailable", freshSeconds: 300 }, now()));
    let candidateKey = null;
    if (candidateCase && ["RESTORE ORIGINAL ACCOUNT", "ALLOW NEW ACCOUNT AFTER REVIEW"].includes(input.outcome)) {
      let provider; try { provider = await auth.getUser(candidateCase.prospectiveUid); } catch { fail("candidate-principal-unavailable", 409); }
      if (!provider.email || provider.disabled || !provider.emailVerified) fail("candidate-control-unconfirmed", 409);
      if (input.outcome === "ALLOW NEW ACCOUNT AFTER REVIEW") {
        const original = (await ref(`accounts/${candidateCase.originalAccountId}`).get()).data();
        if (original?.principalUid === provider.uid) fail("new-provider-principal-required", 409);
      }
      candidateKey = emailKey(provider.email, secret);
    }
    return db.runTransaction(async tx => {
      const currentCase = (await tx.get(ref(`identityConflicts/${caseId}`))).data(); if (!currentCase) fail();
      const action = actions[input.outcome];
      const staff = await resolveStaff(tx, db, claims, { capability: `identity.${action}`, purpose: "identity-resolution", governanceArea: "identity-resolution", objectId: caseId, action, state: currentCase.state, freshSeconds: 300 }, now());
      const prior = (await tx.get(ref(`accountOperations/${operationId}`))).data();
      if (prior) { if (prior.actorUid !== claims.uid || prior.fingerprint !== fingerprint) fail("operation-conflict", 409); return { state: "committed", ...prior.result }; }
      if (currentCase.state !== "open" || currentCase.version !== input.expectedVersion) fail("stale-conflict", 409);
      const original = (await tx.get(ref(`accounts/${identifier(currentCase.originalAccountId)}`))).data();
      const [prospectiveBinding, login] = await Promise.all([tx.get(ref(`accountBindings/${currentCase.prospectiveUid}`)), tx.get(ref(`accountLoginClaims/${currentCase.loginKey}`))]);
      if (candidateCase && currentCase.prospectiveUid !== candidateCase.prospectiveUid) fail("stale-conflict", 409);
      const candidateClaim = candidateKey && candidateKey !== currentCase.loginKey ? (await tx.get(ref(`accountLoginClaims/${candidateKey}`))).data() : null;
      if (candidateClaim && candidateClaim.accountId !== original?.accountId) fail("stale-conflict", 409);
      if (!original || original.version !== currentCase.originalVersion || login.data()?.accountId !== original.accountId) fail("stale-conflict", 409);
      if (Object.values(original.proofEffects || {}).some(Boolean)) fail("outcome-unknown", 409);
      requireFresh(claims, 300, now());
      const actor = { kind: "staff", uid: claims.uid, staffId: staff.staffId };
      let operatingAccountId = null;
      if (["RESTORE ORIGINAL ACCOUNT", "ALLOW NEW ACCOUNT AFTER REVIEW"].includes(input.outcome)) {
        if (!original.lifecycle.startsWith("DELETED-") || prospectiveBinding.data()?.active === true) fail("stale-conflict", 409);
        if (input.outcome === "RESTORE ORIGINAL ACCOUNT") {
          const epoch = original.epoch + 1;
          tx.update(ref(`accounts/${original.accountId}`), { principalUid: currentCase.prospectiveUid, loginKey: candidateKey, lifecycle: "RESTORED", epoch, version: original.version + 1, validAfter: Math.floor(now() / 1000) });
          service.publishAccess(tx, { ...original, principalUid: currentCase.prospectiveUid, lifecycle: "RESTORED", epoch }, false);
          if (original.principalUid !== currentCase.prospectiveUid) service.publishAccess(tx, { ...original, epoch }, false);
          if (original.principalUid !== currentCase.prospectiveUid) tx.set(ref(`accountBindings/${original.principalUid}`), { uid: original.principalUid, accountId: original.accountId, active: false, epoch });
          tx.set(ref(`accountBindings/${currentCase.prospectiveUid}`), { uid: currentCase.prospectiveUid, accountId: original.accountId, active: true, epoch });
          tx.set(ref(`customerProfiles/${original.accountId}`), { accountId: original.accountId, version: 1, fields: { profilePhoto: null, fullName: "", preferredName: "", phoneNumber: "", publicDisplayName: "" } });
          tx.set(ref(`accountPreferences/${original.accountId}`), { accountId: original.accountId, version: 1, ...defaults() });
          tx.set(ref(`accountAddressBooks/${original.accountId}`), { accountId: original.accountId, version: 1, defaultId: null, epoch });
          operatingAccountId = original.accountId;
        } else {
          const account = initialize(tx, { accountId: newAccountId, uid: currentCase.prospectiveUid, loginKey: candidateKey, createdBy: actor });
          tx.update(ref(`accounts/${account.accountId}`), { validAfter: Math.floor(now() / 1000) });
          service.publishAccess(tx, account, false);
          operatingAccountId = account.accountId;
        }
        tx.set(ref(`accountLoginClaims/${candidateKey}`), { accountId: operatingAccountId, uid: currentCase.prospectiveUid, state: "bound" });
        if (candidateKey !== currentCase.loginKey) tx.update(ref(`accountLoginClaims/${currentCase.loginKey}`), { state: "retired" });
      } else if (input.outcome === "RESTRICT REGISTRATION") {
        tx.update(ref(`accountLoginClaims/${currentCase.loginKey}`), { registrationBlocked: true });
        // The original Account lifecycle is deliberately unchanged.
      } else {
        const targetId = identifier(input.canonicalAccountId);
        const target = (await tx.get(ref(`accounts/${targetId}`))).data();
        const sourceBinding = (await tx.get(ref(`accountBindings/${original.principalUid}`))).data();
        const targetBinding = target ? (await tx.get(ref(`accountBindings/${target.principalUid}`))).data() : null;
        if (!target || targetId === original.accountId || target.canonicalAccountId || original.canonicalAccountId || !["ACTIVE", "RESTORED"].includes(target.lifecycle) || !sourceBinding || !targetBinding) fail("stale-conflict", 409);
        await resolveStaff(tx, db, claims, { capability: "identity.rare-merge", purpose: "identity-resolution", governanceArea: "identity-resolution", objectId: targetId, action, state: target.lifecycle, freshSeconds: 300 }, now());
        requireFresh(claims, 300, now());
        tx.update(ref(`accounts/${original.accountId}`), { canonicalAccountId: targetId, epoch: original.epoch + 1, version: original.version + 1, validAfter: Math.floor(now() / 1000) });
        tx.update(ref(`accountBindings/${original.principalUid}`), { active: false, epoch: original.epoch + 1 });
        tx.update(ref(`accounts/${targetId}`), { epoch: target.epoch + 1, version: target.version + 1, validAfter: Math.floor(now() / 1000) });
        tx.update(ref(`accountBindings/${target.principalUid}`), { epoch: target.epoch + 1 });
        service.publishAccess(tx, { ...original, epoch: original.epoch + 1 }, false);
        service.publishAccess(tx, { ...target, epoch: target.epoch + 1 }, false);
        tx.create(ref(`identityLinkage/${operationId}`), { sourceAccountId: original.accountId, canonicalAccountId: targetId, actor, createdAt: now() });
        // No transaction IDs, consent, saved relationships or current settings union.
        operatingAccountId = targetId;
      }
      const result = { outcome: input.outcome, caseVersion: currentCase.version + 1 };
      tx.update(ref(`identityConflicts/${caseId}`), { state: "resolved", version: currentCase.version + 1, outcome: input.outcome, operationId, resolvedAt: now() });
      tx.create(ref(`accountOperations/${operationId}`), { actorUid: claims.uid, action, target: caseId, fingerprint, state: "committed", result, createdAt: now() });
      tx.create(ref(`identityAudit/${operationId}`), { actor, action, caseId, sourceAccountId: original.accountId, operatingAccountId, reason: input.reason.trim(), result: "committed", createdAt: now() });
      tx.create(ref(`accountLifecycleEvents/${operationId}`), { accountId: operatingAccountId || original.accountId, epoch: original.epoch + 1, action, actor, reconciled: false, createdAt: now() });
      return { state: "committed", ...result };
    });
  }
  return { intake, resolve };
}
