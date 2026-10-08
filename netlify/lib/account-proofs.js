import { randomBytes } from "node:crypto";
import { emailKey, exactFields, fail, identifier } from "./account-contract.js";
import { sealControlValue, openControlValue } from "./account-secrets.js";

export function createAccountProofs(service, { deliverProof, origin, ttlSeconds = 3600, passwordMatches = async () => false } = {}) {
  const { db, auth, ref, keyed, customer, secret, now } = service;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 86400) fail("proof-source-unavailable", 503);
  function tokenKey(token) { if (typeof token !== "string" || !/^udc_[A-Za-z0-9_-]{43}$/.test(token)) fail("proof-malformed", 400); return keyed(token); }
  async function queueRecovery(input) {
    exactFields(input, ["email", "returnTo", "operationId"]);
    const loginKey = emailKey(input.email, secret), operationId = identifier(input.operationId);
    await db.runTransaction(async tx => {
      const intentRef = ref(`accountRecoveryIntents/${loginKey}`), jobRef = ref(`accountRecoveryIntake/${operationId}`);
      const [intent, prior] = await Promise.all([tx.get(intentRef), tx.get(jobRef)]);
      if (prior.exists) { if (prior.data().loginKey !== loginKey) fail(); return; }
      const generation = (intent.data()?.generation || 0) + 1;
      tx.set(intentRef, { generation });
      tx.create(jobRef, { loginKey, generation, sealedEmail: sealControlValue(input.email.trim(), secret), state: "pending", createdAt: now(), expiresAt: now() + 86400000, executor: "system:account-recovery-delivery" });
    });
    // The public path does identical intake work for missing, blocked and eligible
    // identities. No provider lookup or email-delivery latency leaks existence.
    return { state: "accepted" };
  }
  async function processRecoveryIntake(operationId) {
    const jobRef = ref(`accountRecoveryIntake/${identifier(operationId)}`), job = (await jobRef.get()).data();
    if (!job || job.state !== "pending" || job.expiresAt <= now()) return { state: "superseded" };
    const current = (await ref(`accountRecoveryIntents/${job.loginKey}`).get()).data();
    if (current?.generation !== job.generation) { await jobRef.update({ state: "superseded" }); return { state: "superseded" }; }
    const result = await issue(null, { email: openControlValue(job.sealedEmail, secret) }, "reset", { operationId, loginKey: job.loginKey, generation: job.generation });
    await jobRef.update({ state: "processed", sealedEmail: null, processedAt: now() });
    return result;
  }
  async function issue(claims, input, purpose, intake = null) {
    exactFields(input, purpose === "reset" ? ["email", "returnTo"] : ["returnTo"]);
    if (typeof deliverProof !== "function") fail("proof-delivery-unavailable", 503);
    const token = "udc_" + (intake ? Buffer.from(keyed("recovery-proof:" + intake.operationId), "hex") : randomBytes(32)).toString("base64url"), proofId = tokenKey(token);
    let provider;
    if (purpose === "reset") {
      const claim = (await ref(`accountLoginClaims/${emailKey(input.email, secret)}`).get()).data();
      if (!claim || claim.state !== "bound") return { state: "accepted" };
      try { provider = await auth.getUser(claim.uid); } catch { return { state: "accepted" }; }
    } else provider = await auth.getUser(claims.uid);
    if (!provider?.email || provider.disabled) return { state: "accepted" };
    const result = await db.runTransaction(async tx => {
      const binding = (await tx.get(ref(`accountBindings/${provider.uid}`))).data();
      const account = binding?.accountId ? (await tx.get(ref(`accounts/${binding.accountId}`))).data() : null;
      const priorProof = (await tx.get(ref(`accountProofs/${proofId}`))).data();
      if (purpose === "verify") await customer(tx, claims);
      if (intake && (await tx.get(ref(`accountRecoveryIntents/${intake.loginKey}`))).data()?.generation !== intake.generation) return null;
      if (!account || binding.active !== true || binding.uid !== provider.uid || account.principalUid !== provider.uid || binding.epoch !== account.epoch
        || account.canonicalAccountId || !["ACTIVE", "RESTORED"].includes(account.lifecycle) || emailKey(provider.email, secret) !== account.loginKey) return null;
      if (account.proofEffects?.[purpose]) return null; // uncertain older effect must reconcile before another credential intent
      if (priorProof) return priorProof.state === "valid" && priorProof.epoch === account.epoch && priorProof.sequence === account.proofVersions?.[purpose] && priorProof.expiresAt > now() ? { accountId: account.accountId } : null;
      const sequence = (account.proofVersions?.[purpose] || 0) + 1;
      tx.update(ref(`accounts/${account.accountId}`), { proofVersions: { ...account.proofVersions, [purpose]: sequence } });
      tx.create(ref(`accountProofs/${proofId}`), { accountId: account.accountId, uid: provider.uid, purpose, loginKey: account.loginKey, epoch: account.epoch, sequence, state: "valid", expiresAt: now() + ttlSeconds * 1000, createdAt: now() });
      return { accountId: account.accountId };
    });
    if (result) {
      const url = new URL(purpose === "reset" ? "/reset-password" : "/auth/action", origin);
      url.searchParams.set("oobCode", token); if (purpose === "verify") url.searchParams.set("mode", "verifyEmail");
      // Proof-bearing URI goes only to the approved email-delivery port, never Audit/logs.
      try { await deliverProof({ email: provider.email, purpose, url: url.toString(), idempotencyKey: proofId }); }
      catch { /* neutral intake: delivery is neither assumed nor exposed */ }
    }
    return { state: "accepted" };
  }
  async function inspect(input, claims = null) {
    exactFields(input, ["token", "purpose"]); if (!["verify", "reset"].includes(input.purpose)) fail("proof-malformed", 400);
    const proofId = tokenKey(input.token);
    return db.runTransaction(async tx => {
      const proof = (await tx.get(ref(`accountProofs/${proofId}`))).data();
      if (!proof || proof.purpose !== input.purpose) return { state: "malformed" };
      if (claims && claims.uid !== proof.uid) return { state: "identity-conflict" };
      if (proof.state === "consumed") return { state: "consumed" };
      if (proof.state === "unknown" || proof.state === "pending") return { state: "temporarily-unverifiable" };
      const account = (await tx.get(ref(`accounts/${proof.accountId}`))).data();
      const binding = (await tx.get(ref(`accountBindings/${proof.uid}`))).data();
      if (!account || binding?.active !== true || binding.accountId !== account.accountId || account.principalUid !== proof.uid || account.canonicalAccountId
        || !["ACTIVE", "RESTORED"].includes(account.lifecycle)) return { state: "ineligible" };
      if (proof.epoch !== account.epoch || proof.loginKey !== account.loginKey || proof.sequence !== account.proofVersions?.[proof.purpose]) return { state: "superseded" };
      return { state: proof.expiresAt <= now() ? "expired" : "valid" };
    });
  }
  async function consume(input, claims = null) {
    exactFields(input, ["token", "purpose", "operationId", "password"]);
    identifier(input.operationId); const proofId = tokenKey(input.token);
    if (input.purpose === "reset" && (typeof input.password !== "string" || input.password.length < 15 || input.password.length > 64)) fail("invalid-argument", 400);
    const proof = await db.runTransaction(async tx => {
      const current = (await tx.get(ref(`accountProofs/${proofId}`))).data();
      if (!current || current.purpose !== input.purpose) fail("proof-malformed", 400);
      if (claims && claims.uid !== current.uid) fail("proof-identity-conflict");
      if (current.state !== "valid") fail(current.state === "consumed" ? "proof-consumed" : "outcome-unknown", 409);
      const account = (await tx.get(ref(`accounts/${current.accountId}`))).data();
      const binding = (await tx.get(ref(`accountBindings/${current.uid}`))).data();
      const effect = (await tx.get(ref(`accountProofOperations/${input.operationId}`))).data();
      if (effect || account?.proofEffects?.[current.purpose]) fail("outcome-unknown", 409);
      if (!account || binding?.active !== true || binding.accountId !== current.accountId || account.principalUid !== current.uid || account.canonicalAccountId || !["ACTIVE", "RESTORED"].includes(account.lifecycle)) fail("proof-ineligible");
      if (current.epoch !== account.epoch || current.sequence !== account.proofVersions?.[current.purpose] || current.loginKey !== account.loginKey) fail("proof-superseded", 409);
      if (current.expiresAt <= now()) fail("proof-expired", 409);
      tx.update(ref(`accountProofs/${proofId}`), { state: "pending", operationId: input.operationId, submittedAt: now() });
      tx.create(ref(`accountProofOperations/${input.operationId}`), { proofId, purpose: current.purpose, state: "pending", createdAt: now() });
      tx.update(ref(`accounts/${account.accountId}`), { proofEffects: { ...account.proofEffects, [current.purpose]: proofId } });
      // Stale sessions lose authority before a password effect can become uncertain.
      if (input.purpose === "reset") {
        tx.update(ref(`accounts/${account.accountId}`), { validAfter: Math.floor(now() / 1000), epoch: account.epoch + 1, version: account.version + 1 });
        tx.update(ref(`accountBindings/${current.uid}`), { epoch: account.epoch + 1 });
        tx.set(ref(`principalSecurity/${current.uid}`), { validAfter: Math.floor(now() / 1000) });
        service.publishAccess(tx, { ...account, epoch: account.epoch + 1 }, false);
      }
      return current;
    });
    try { await auth.updateUser(proof.uid, input.purpose === "reset" ? { password: input.password } : { emailVerified: true }); }
    catch {
      await ref(`accountProofs/${proofId}`).update({ state: "unknown" });
      return { state: "unknown" }; // No blind provider credential retry.
    }
    return finish(proofId, proof, input);
  }
  async function finish(proofId, proof, input) {
    return db.runTransaction(async tx => {
      const current = (await tx.get(ref(`accountProofs/${proofId}`))).data();
      const account = (await tx.get(ref(`accounts/${proof.accountId}`))).data();
      if (current?.operationId !== input.operationId || !["pending", "unknown"].includes(current.state)) fail("operation-conflict", 409);
      tx.update(ref(`accountProofs/${proofId}`), { state: "consumed", consumedAt: now() });
      tx.update(ref(`accountProofOperations/${input.operationId}`), { state: "committed" });
      if (proof.purpose === "verify" && account?.principalUid === proof.uid && account.epoch === proof.epoch && account.loginKey === proof.loginKey
        && ["ACTIVE", "RESTORED"].includes(account.lifecycle) && account.proofVersions?.verify === proof.sequence) tx.update(ref(`accounts/${proof.accountId}`), { emailControlConfirmed: true });
      if (account?.proofEffects?.[proof.purpose] === proofId) tx.update(ref(`accounts/${proof.accountId}`), { proofEffects: { ...account.proofEffects, [proof.purpose]: null } });
      if (account && ["ACTIVE", "RESTORED"].includes(account.lifecycle) && !account.canonicalAccountId) service.publishAccess(tx, account, true);
      tx.create(ref(`accountSecurityEvidence/${input.operationId}`), { accountId: proof.accountId, uid: proof.uid, purpose: proof.purpose, createdAt: now(), effect: proof.purpose === "reset" ? "password-updated" : "email-verified" });
      return { state: "committed", effect: proof.purpose === "reset" ? "password-updated" : "email-verified", accountAccessAuthorized: false };
    });
  }
  async function reconcile(input, claims = null) {
    exactFields(input, ["token", "purpose", "operationId", "password"]);
    const proofId = tokenKey(input.token), proof = (await ref(`accountProofs/${proofId}`).get()).data();
    if (!proof || proof.purpose !== input.purpose || proof.operationId !== input.operationId) fail();
    if (claims && claims.uid !== proof.uid) fail("proof-identity-conflict");
    if (proof.state === "consumed") return { state: "committed", accountAccessAuthorized: false };
    if (!["unknown", "pending"].includes(proof.state)) return { state: "unknown" };
    const provider = await auth.getUser(proof.uid);
    // A non-match cannot prove the old operation failed: a later password change
    // could have superseded it. Leave that result unknown, never replay the write.
    const confirmed = proof.purpose === "verify" ? provider.emailVerified && emailKey(provider.email, secret) === proof.loginKey
      : typeof input.password === "string" && await passwordMatches(provider, input.password);
    return confirmed ? finish(proofId, proof, input) : { state: "unknown" };
  }
  return { issueVerification: (claims, input) => issue(claims, input, "verify"), requestRecovery: input => issue(null, input, "reset"), queueRecovery, processRecoveryIntake, inspect, consume, reconcile };
}
