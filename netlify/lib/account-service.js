import { randomUUID, createHmac } from "node:crypto";
import { activeAccount, addressFields, customerProjection, digest, emailKey, exactFields, fail, identifier, preferenceFields, profileFields, requireFresh, RESOLUTIONS } from "./account-contract.js";
import { resolveStaff, resolveStaffIdentity } from "./staff-authority.js";
import { captureIntent } from "./downstream-intent.js";

export function createAccountService({ db, auth, secret, now = Date.now, guestIntentOwner }) {
  const ref = path => db.doc(path);
  const keyed = value => createHmac("sha256", secret).update(value).digest("hex");
  const defaults = () => ({ preset: "Important Only", couturierAlerts: false, styleCircle: false });
  const profile = accountId => ({ accountId, version: 1, fields: { profilePhoto: null, fullName: "", preferredName: "", phoneNumber: "", publicDisplayName: "" } });
  const stamp = () => now();
  const capture = (tx, event) => captureIntent(tx, { ref, keyed, now }, event);
  function publishAccess(tx, account, available = true) {
    tx.set(ref(`customerAccess/${account.principalUid}`), { accountId: account.accountId, epoch: account.epoch, lifecycle: account.lifecycle, available });
  }
  async function customer(tx, claims, options = {}) {
    identifier(claims.uid);
    const binding = (await tx.get(ref(`accountBindings/${claims.uid}`))).data();
    if (!binding || !binding.accountId) fail("account-binding-required");
    const account = (await tx.get(ref(`accounts/${identifier(binding.accountId)}`))).data();
    if (claims._session) {
      const session = (await tx.get(ref(`accountSessions/${claims._session.id}`))).data();
      if (!session || session.kind !== "customer" || session.uid !== claims.uid || !session.active || session.expiresAt <= now() || session.accountId !== account?.accountId || session.epoch !== account?.epoch) fail("session-required", 401);
    }
    return activeAccount(account, claims, binding, { now: now(), ...options });
  }
  function initialize(tx, { accountId, uid, loginKey, createdBy, lifecycle = "ACTIVE", epoch = 1 }) {
    const account = { accountId, principalUid: uid, loginKey, lifecycle, epoch, version: 1, emailControlConfirmed: false, validAfter: 0, createdAt: stamp() };
    tx.create(ref(`accounts/${accountId}`), account);
    publishAccess(tx, account);
    tx.set(ref(`accountBindings/${uid}`), { uid, accountId, active: true, epoch });
    tx.create(ref(`customerProfiles/${accountId}`), profile(accountId));
    tx.create(ref(`accountPreferences/${accountId}`), { accountId, version: 1, ...defaults() });
    tx.create(ref(`accountAddressBooks/${accountId}`), { accountId, version: 1, defaultId: null, epoch });
    tx.create(ref(`accountEvidence/${randomUUID()}`), { action: "bootstrap", accountId, actor: createdBy, executor: "system:account-bootstrap", createdAt: stamp() });
    const bootstrapActor = createdBy.staffId ? { kind: "staff", staffId: createdBy.staffId }
      : { kind: createdBy.kind, ...(createdBy.operationId ? { operationId: createdBy.operationId } : {}) };
    capture(tx, { domain: "account-bootstrap", operationId: accountId, action: "bootstrap", target: accountId, actor: bootstrapActor, executor: "system:account-bootstrap" });
    return account;
  }
  async function register(input) {
    exactFields(input, ["email", "password", "operationId"]);
    const operationId = identifier(input.operationId), loginKey = emailKey(input.email, secret);
    if (typeof input.password !== "string" || input.password.length < 15 || input.password.length > 64) fail("invalid-argument", 400);
    const reservationRef = ref(`accountRegistrations/${operationId}`), claimRef = ref(`accountLoginClaims/${loginKey}`);
    const candidateUid = randomUUID(), candidateId = randomUUID();
    const reservation = await db.runTransaction(async tx => {
      const [prior, claim] = await Promise.all([tx.get(reservationRef), tx.get(claimRef)]);
      if (prior.exists) { if (prior.data().loginKey !== loginKey) fail(); return prior.data(); }
      if (claim.exists) {
        if (claim.data().registrationId) return { ...claim.data(), existingIntent: true };
        tx.create(reservationRef, { loginKey, state: "conflict", createdAt: stamp() });
        return { state: "conflict" };
      }
      const value = { operationId, loginKey, uid: candidateUid, accountId: candidateId, state: "reserved", createdAt: stamp() };
      tx.create(reservationRef, value); tx.create(claimRef, { registrationId: operationId, uid: candidateUid, accountId: candidateId, state: "reserved" });
      return value;
    });
    // Another registration intent is not permission to act for its reserved principal.
    if (reservation.existingIntent || reservation.state === "conflict") return { state: "accepted" };
    if (reservation.state === "committed") return { state: "accepted" };
    let provider;
    try { provider = await auth.getUser(reservation.uid); }
    catch (error) { if (error.code !== "auth/user-not-found") throw error; }
    if (!provider) {
      try { provider = await auth.createUser({ uid: reservation.uid, email: input.email.trim(), password: input.password, emailVerified: false }); }
      catch (error) {
        if (!["auth/email-already-exists", "auth/uid-already-exists"].includes(error.code)) throw error;
        // Lost acknowledgement of our exact reserved UID can be reconciled;
        // an email match with an unrelated UID can NEVER bootstrap an Account.
        try { provider = await auth.getUser(reservation.uid); } catch { return { state: "accepted" }; }
      }
    }
    if (emailKey(provider.email, secret) !== loginKey || provider.disabled) fail();
    await db.runTransaction(async tx => {
      const [current, claim, binding] = await Promise.all([tx.get(reservationRef), tx.get(claimRef), tx.get(ref(`accountBindings/${reservation.uid}`))]);
      if (current.data()?.state === "committed") return;
      if (current.data()?.state !== "reserved" || claim.data()?.registrationId !== operationId || binding.exists) fail();
      initialize(tx, { accountId: reservation.accountId, uid: reservation.uid, loginKey, createdBy: { kind: "guest-intent", operationId, providerUid: reservation.uid } });
      tx.update(reservationRef, { state: "committed", committedAt: stamp() });
      tx.set(claimRef, { accountId: reservation.accountId, uid: reservation.uid, state: "bound" });
    });
    return { state: "accepted" };
  }
  async function context(claims) {
    return db.runTransaction(async tx => customerProjection(await customer(tx, claims, { allowBlocked: true, allowUnverified: true })));
  }
  async function registrationResult(claims, operationId) {
    const reservation = (await ref(`accountRegistrations/${identifier(operationId)}`).get()).data();
    return { state: reservation?.uid === claims.uid && reservation.state === "committed" ? "committed" : "unconfirmed" };
  }
  async function readProfile(claims) {
    return db.runTransaction(async tx => {
      const account = await customer(tx, claims);
      const current = (await tx.get(ref(`customerProfiles/${account.accountId}`))).data();
      if (!current || current.accountId !== account.accountId) fail("profile-source-unavailable", 503);
      return { accountId: account.accountId, epoch: account.epoch, version: current.version, ...profileFields(current.fields, { mutation: false }) };
    });
  }
  async function operation(tx, claims, input, action, target, account) {
    if (input.expectedEpoch !== account.epoch) fail("stale-authority", 409);
    const id = identifier(input.operationId), receiptRef = ref(`accountOperations/${id}`);
    const fingerprint = keyed(JSON.stringify({ actorUid: claims.uid, epoch: account.epoch, action, target, input }));
    const prior = await tx.get(receiptRef);
    if (prior.exists && (prior.data().fingerprint !== fingerprint || prior.data().actorUid !== claims.uid)) fail("operation-conflict", 409);
    return { prior: prior.exists ? prior.data() : null, commit(result) {
      const value = { operationId: id, action, target, accountId: account.accountId, actorUid: claims.uid, actorKind: "customer", fingerprint, result, state: "committed", createdAt: stamp() };
      tx.create(receiptRef, value);
      capture(tx, { domain: "account", operationId: id, action, target, actor: { kind: "customer", accountId: account.accountId }, executor: "system:account-api" });
      return { state: "committed", ...result };
    } };
  }
  async function saveProfile(claims, input) {
    exactFields(input, ["operationId", "expectedVersion", "expectedEpoch", "fields"]); const fields = profileFields(input.fields);
    return db.runTransaction(async tx => {
      const account = await customer(tx, claims), path = `customerProfiles/${account.accountId}`;
      const receipt = await operation(tx, claims, input, "profile.save", account.accountId, account);
      if (receipt.prior) return { state: "committed", ...receipt.prior.result };
      const current = (await tx.get(ref(path))).data();
      if (!current || current.version !== input.expectedVersion) fail("stale-conflict", 409);
      tx.update(ref(path), { fields: { ...current.fields, ...fields }, version: current.version + 1, updatedAt: stamp() });
      return receipt.commit({ version: current.version + 1 });
    });
  }
  async function addresses(claims) {
    return db.runTransaction(async tx => {
      const account = await customer(tx, claims), path = `accountAddressBooks/${account.accountId}`;
      const [book, rows] = await Promise.all([tx.get(ref(path)), tx.get(db.collection(path + "/addresses"))]);
      if (!book.exists || book.data().accountId !== account.accountId) fail("address-source-unavailable", 503);
      const permitted = rows.docs.filter(doc => doc.data().epoch === book.data().epoch && doc.data().accountId === account.accountId);
      if (permitted.length && !permitted.some(doc => doc.id === book.data().defaultId)) fail("address-source-unavailable", 503);
      return { epoch: account.epoch, version: book.data().version, defaultId: permitted.length ? book.data().defaultId : null, records: permitted.map(doc => ({ id: doc.id, ...addressFields(doc.data().fields), version: doc.data().version })) };
    });
  }
  async function addressMutation(claims, input) {
    exactFields(input, ["operationId", "expectedVersion", "expectedEpoch", "action", "addressId", "fields"]);
    if (!["create", "edit", "delete", "default"].includes(input.action)) fail("invalid-argument", 400);
    const addressId = input.action === "create" ? digest(identifier(input.operationId)).slice(0, 40) : identifier(input.addressId);
    const fields = ["create", "edit"].includes(input.action) ? addressFields(input.fields) : null;
    return db.runTransaction(async tx => {
      const account = await customer(tx, claims), path = `accountAddressBooks/${account.accountId}`;
      const receipt = await operation(tx, claims, input, "address." + input.action, addressId, account);
      if (receipt.prior) return { state: "committed", ...receipt.prior.result };
      const [book, old, rows] = await Promise.all([tx.get(ref(path)), tx.get(ref(path + "/addresses/" + addressId)), tx.get(db.collection(path + "/addresses"))]);
      if (!book.exists || book.data().accountId !== account.accountId || book.data().version !== input.expectedVersion) fail("stale-conflict", 409);
      if (input.action === "create" ? old.exists : !old.exists || old.data().epoch !== book.data().epoch) fail("stale-conflict", 409);
      if (old.exists && old.data().accountId !== account.accountId) fail();
      const version = book.data().version + 1;
      if (fields) tx.set(ref(path + "/addresses/" + addressId), { accountId: account.accountId, epoch: book.data().epoch, fields, version: (old.data()?.version || 0) + 1 });
      if (input.action === "delete") tx.delete(ref(path + "/addresses/" + addressId));
      const nextDefault = input.action === "default" || (!book.data().defaultId && input.action === "create") ? addressId : input.action === "delete" && book.data().defaultId === addressId ? rows.docs.find(doc => doc.id !== addressId && doc.data().epoch === book.data().epoch && doc.data().accountId === account.accountId)?.id || null : book.data().defaultId;
      tx.update(ref(path), { version, defaultId: nextDefault });
      return receipt.commit({ version, addressId });
    });
  }
  async function readPreferences(claims) {
    return db.runTransaction(async tx => {
      const account = await customer(tx, claims), value = (await tx.get(ref(`accountPreferences/${account.accountId}`))).data();
      if (!value || value.accountId !== account.accountId) fail("preferences-source-unavailable", 503);
      return { accountId: account.accountId, epoch: account.epoch, version: value.version, ...preferenceFields(Object.fromEntries(["preset", "couturierAlerts", "styleCircle", "quietHours", "styleDigest"].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]))) };
    });
  }
  async function savePreferences(claims, input) {
    exactFields(input, ["operationId", "expectedVersion", "expectedEpoch", "fields"]); const fields = preferenceFields(input.fields);
    return db.runTransaction(async tx => {
      const account = await customer(tx, claims), path = `accountPreferences/${account.accountId}`;
      const receipt = await operation(tx, claims, input, "preferences.save", account.accountId, account);
      if (receipt.prior) return { state: "committed", ...receipt.prior.result };
      const current = (await tx.get(ref(path))).data(); if (!current || current.version !== input.expectedVersion) fail("stale-conflict", 409);
      tx.update(ref(path), { ...fields, version: current.version + 1 });
      tx.create(ref(`accountConsentEvidence/${input.operationId}`), { accountId: account.accountId, actorUid: claims.uid, action: "preference-change", fields, version: current.version + 1, createdAt: stamp() });
      return receipt.commit({ version: current.version + 1 });
    });
  }
  async function ownsResult(tx,claims,value,operationId,domain) {
    if(!value||value.actorUid!==claims.uid)return false;
    let actor=value.actor;
    if(!actor&&value.accountId)actor={kind:"customer",accountId:value.accountId};
    if(!actor){const event=(await tx.get(ref(`ownerEvents/${keyed(`event:${domain}:${operationId}`)}`))).data();actor=event?.actor;}
    if(!actor&&domain==="account")actor=(await tx.get(ref(`identityAudit/${operationId}`))).data()?.actor;
    if(actor?.accountId){
      const binding=(await tx.get(ref(`accountBindings/${claims.uid}`))).data();
      const current=binding?.accountId?(await tx.get(ref(`accounts/${binding.accountId}`))).data():null;
      // Deletion may still confirm its own minimal result. A different durable
      // identity (Allow New/rebinding) cannot inherit the old result/IDs.
      return binding?.uid===claims.uid&&binding.accountId===actor.accountId&&binding.epoch===current?.epoch&&current?.principalUid===claims.uid&&!current.canonicalAccountId;
    }
    if(actor?.staffId){try{return(await resolveStaffIdentity(tx,db,claims,now())).staffId===actor.staffId;}catch(error){if([401,403].includes(error.status))return false;throw error;}}
    return false; // Missing provenance is not reconstructed from Email/title/UID.
  }
  async function reconcile(claims, operationId) {
    identifier(operationId);
    return db.runTransaction(async tx=>{const value=(await tx.get(ref(`accountOperations/${operationId}`))).data();
      return await ownsResult(tx,claims,value,operationId,"account")?{state:value.state,...value.result}:{state:"unknown"};
    });
  }
  async function myInformation(claims) {
    const groups = await Promise.allSettled([readProfile(claims), readPreferences(claims), addresses(claims)]);
    // Recheck after composition; a concurrent delete cannot leak a loaded prior group.
    await db.runTransaction(tx => customer(tx, claims));
    return { complete: false, groups: groups.map((group, index) => ({ name: ["Profile", "Communications", "Saved Addresses"][index], state: group.status === "fulfilled" ? "loaded" : "unavailable", ...(group.status === "fulfilled" ? { data: group.value } : {}) })), externalGroups: ["Style Information", "Order Information"].map(name => ({ name, state: "unavailable" })) };
  }
  async function revokeSessions(claims, input) {
    exactFields(input, ["operationId", "expectedVersion", "expectedEpoch"]);
    const result = await db.runTransaction(async tx => {
      const account = await customer(tx, claims, { freshSeconds: 300 });
      const receipt = await operation(tx, claims, input, "sessions.revoke", account.accountId, account);
      if (receipt.prior) return { state: "committed", ...receipt.prior.result };
      if (account.version !== input.expectedVersion) fail("stale-conflict", 409);
      tx.update(ref(`accounts/${account.accountId}`), { validAfter: Math.floor(now() / 1000), version: account.version + 1, epoch: account.epoch + 1 });
      tx.update(ref(`accountBindings/${claims.uid}`), { epoch: account.epoch + 1 });
      tx.set(ref(`principalSecurity/${claims.uid}`), { validAfter: Math.floor(now() / 1000) });
      publishAccess(tx, { ...account, epoch: account.epoch + 1 }, false);
      return receipt.commit({ version: account.version + 1 });
    });
    try { await auth.revokeRefreshTokens(claims.uid); } catch { /* current server cutoff is already authoritative */ }
    return result;
  }
  async function staffCustomerInformation(claims, input) {
    exactFields(input, ["accountId"]); const accountId = identifier(input.accountId);
    return db.runTransaction(async tx => {
      const account = (await tx.get(ref(`accounts/${accountId}`))).data(); if (!account) fail();
      await resolveStaff(tx, db, claims, { capability: "customers.contact.read", purpose: "customer-support", dataClass: "profile-contact", objectId: accountId, action: "read", state: account.lifecycle }, now());
      const source = (await tx.get(ref(`customerProfiles/${accountId}`))).data(); if (!source || source.accountId !== accountId) fail();
      // Never include email credentials, address book, photo, preference evidence,
      // unrelated histories or internal fields in a service-contact projection.
      return { accountId, fullName: source.fields.fullName, phoneNumber: source.fields.phoneNumber };
    });
  }
  async function staffDeletedAccount(claims, input) {
    exactFields(input, ["accountId"]); const accountId = identifier(input.accountId);
    return db.runTransaction(async tx => {
      const [tombstone, account] = await Promise.all([tx.get(ref(`accountTombstones/${accountId}`)), tx.get(ref(`accounts/${accountId}`))]); if (!tombstone.exists || !account.exists) fail();
      await resolveStaff(tx, db, claims, { capability: "accounts.deleted.read", purpose: "account-lifecycle", dataClass: "tombstone", objectId: accountId, action: "read", state: account.data().lifecycle }, now());
      return { accountId, currentLifecycle: account.data().lifecycle, historicalDeletion: { lifecycle: tombstone.data().lifecycle, deletedAt: tombstone.data().deletedAt } };
    });
  }
  async function deletion(claims, input) {
    exactFields(input, ["operationId", "expectedVersion", "expectedEpoch", "confirmation"]); if (input.confirmation !== "DELETE ACCOUNT") fail("confirmation-required", 400);
    const result = await db.runTransaction(async tx => {
      const account = await customer(tx, claims, { freshSeconds: 300 });
      const receipt = await operation(tx, claims, input, "account.delete", account.accountId, account);
      if (receipt.prior) return { state: "committed", ...receipt.prior.result };
      if (account.version !== input.expectedVersion) fail("stale-conflict", 409);
      const [preferences, book] = await Promise.all([tx.get(ref(`accountPreferences/${account.accountId}`)), tx.get(ref(`accountAddressBooks/${account.accountId}`))]);
      requireFresh(claims, 300, now());
      const epoch = account.epoch + 1;
      tx.update(ref(`accounts/${account.accountId}`), { lifecycle: "DELETED-CUSTOMER REQUESTED", version: account.version + 1, epoch, validAfter: Math.floor(now() / 1000), deletedAt: stamp() });
      tx.update(ref(`accountBindings/${claims.uid}`), { active: false, epoch });
      tx.create(ref(`accountTombstones/${account.accountId}`), { accountId: account.accountId, loginKey: account.loginKey, lifecycle: "DELETED-CUSTOMER REQUESTED", epoch, deletedAt: stamp() });
      publishAccess(tx, { ...account, lifecycle: "DELETED-CUSTOMER REQUESTED", epoch }, false);
      tx.delete(ref(`customerProfiles/${account.accountId}`));
      tx.set(ref(`accountPreferences/${account.accountId}`), { accountId: account.accountId, version: (preferences.data()?.version || 0) + 1, ...defaults() });
      if (book.exists) tx.update(ref(`accountAddressBooks/${account.accountId}`), { version: book.data().version + 1, defaultId: null });
      tx.create(ref(`accountLifecycleEvents/${input.operationId}`), { accountId: account.accountId, epoch, action: "delete", actor: { kind: "customer", uid: claims.uid }, createdAt: stamp(), reconciled: false });
      return receipt.commit({ lifecycle: "DELETED-CUSTOMER REQUESTED", version: account.version + 1 });
    });
    // Owner commit and immediate access withdrawal never wait on secondary effects.
    try { await auth.revokeRefreshTokens(claims.uid); } catch { /* event remains pending; no replay of deletion */ }
    return result;
  }
  async function lifecycle(claims, input) {
    exactFields(input, ["operationId", "accountId", "expectedVersion", "action", "reason"]);
    if (!["restrict", "delete-admin"].includes(input.action) || typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 1000) fail("invalid-argument", 400);
    const accountId = identifier(input.accountId), operationId = identifier(input.operationId);
    return db.runTransaction(async tx => {
      const account = (await tx.get(ref(`accounts/${accountId}`))).data(); if (!account) fail();
      const staff = await resolveStaff(tx, db, claims, { capability: `accounts.${input.action}`, purpose: "account-lifecycle", governanceArea: "account-lifecycle", objectId: accountId, action: input.action, state: account.lifecycle, freshSeconds: 300 }, now());
      const prior = (await tx.get(ref(`accountOperations/${operationId}`))).data();
      if (prior) { if (prior.actorUid !== claims.uid || prior.target !== accountId || prior.action !== input.action) fail(); return { state: "committed", ...prior.result }; }
      if (account.version !== input.expectedVersion || !["ACTIVE", "RESTORED", "RESTRICTED"].includes(account.lifecycle)) fail("stale-conflict", 409);
      const preferences = input.action === "delete-admin" ? await tx.get(ref(`accountPreferences/${accountId}`)) : null;
      requireFresh(claims, 300, now());
      const next = input.action === "restrict" ? "RESTRICTED" : "DELETED-ADMIN ACTION", epoch = account.epoch + 1;
      tx.update(ref(`accounts/${accountId}`), { lifecycle: next, epoch, version: account.version + 1, validAfter: Math.floor(now() / 1000) });
      tx.update(ref(`accountBindings/${account.principalUid}`), { active: input.action === "restrict", epoch });
      publishAccess(tx, { ...account, lifecycle: next, epoch }, false);
      if (input.action === "delete-admin") {
        tx.create(ref(`accountTombstones/${accountId}`), { accountId, loginKey: account.loginKey, lifecycle: next, epoch, deletedAt: stamp() });
        tx.delete(ref(`customerProfiles/${accountId}`)); tx.set(ref(`accountPreferences/${accountId}`), { accountId, version: (preferences.data()?.version || 0) + 1, ...defaults() });
      }
      const actor = { kind: "staff", uid: claims.uid, staffId: staff.staffId };
      const result = { lifecycle: next, version: account.version + 1 };
      tx.create(ref(`accountOperations/${operationId}`), { operationId, actorUid: claims.uid, actor, action: input.action, target: accountId, result, state: "committed", createdAt: stamp() });
      tx.create(ref(`accountLifecycleEvents/${operationId}`), { accountId, epoch, action: input.action, actor, createdAt: stamp(), reconciled: false });
      tx.create(ref(`identityAudit/${operationId}`), { actor, action: input.action, accountId, reason: input.reason.trim(), createdAt: stamp(), result: "committed" });
      capture(tx, { domain: "account", operationId, action: input.action, target: accountId, actor: { kind: "staff", staffId: staff.staffId }, executor: "system:account-api" });
      return { state: "committed", ...result };
    });
  }
  async function optionalCommunicationEligible(accountId, category) {
    if (!["couturierAlerts", "styleCircle"].includes(category)) return false;
    return db.runTransaction(async tx => {
      const [account, preferences] = await Promise.all([tx.get(ref(`accounts/${identifier(accountId)}`)), tx.get(ref(`accountPreferences/${accountId}`))]);
      return ["ACTIVE", "RESTORED"].includes(account.data()?.lifecycle) && !account.data()?.canonicalAccountId && preferences.data()?.[category] === true;
    });
  }
  async function importGuestIntent(claims, input) {
    exactFields(input, ["operationId", "expectedEpoch", "intent"]);
    exactFields(input.intent, ["kind", "objectId", "positive"]);
    if (!["saved-piece", "saved-review"].includes(input.intent.kind) || input.intent.positive !== true) fail("invalid-argument", 400);
    identifier(input.intent.objectId);
    if (typeof guestIntentOwner !== "function") fail("owner-source-unavailable", 503);
    return db.runTransaction(async tx => {
      const account = await customer(tx, claims);
      const receipt = await operation(tx, claims, input, "guest.import", input.intent.objectId, account);
      if (receipt.prior) return { state: "committed", ...receipt.prior.result };
      const result = await guestIntentOwner(tx, { accountId: account.accountId, epoch: account.epoch, principalUid: claims.uid }, input.intent);
      if (result?.state !== "committed") fail("owner-source-unavailable", 503);
      return receipt.commit({ imported: true });
    });
  }
  async function cleanupDeletedAddresses(eventId) {
    const event = (await ref(`accountLifecycleEvents/${identifier(eventId)}`).get()).data(); if (!event) fail();
    let removed = 0;
    for (let batch = 0; batch < 10; batch++) {
      const count = await db.runTransaction(async tx => {
        const account = (await tx.get(ref(`accounts/${event.accountId}`))).data();
        const bookRef = ref(`accountAddressBooks/${event.accountId}`), book = (await tx.get(bookRef)).data();
        if (!account || !book) return 0;
        const rows = await tx.get(bookRef.collection("addresses").limit(100));
        const deletable = rows.docs.filter(row => account.lifecycle.startsWith("DELETED-") || row.data().epoch !== book.epoch);
        for (const row of deletable) tx.delete(row.ref);
        return deletable.length;
      });
      removed += count; if (count < 100) break;
    }
    return { removed, executor: "system:account-cleanup" };
  }
  async function reconcileLifecycle(eventId) {
    return db.runTransaction(async tx => {
      const eventRef = ref(`accountLifecycleEvents/${identifier(eventId)}`), event = await tx.get(eventRef);
      if (!event.exists) fail();
      const account = (await tx.get(ref(`accounts/${event.data().accountId}`))).data(); if (!account) fail();
      // Current owner epoch, not the arriving event, controls derived suppression.
      tx.set(ref(`accountLifecycleProjection/${account.accountId}`), { accountId: account.accountId, epoch: account.epoch, optionalEligible: ["ACTIVE", "RESTORED"].includes(account.lifecycle) && !account.canonicalAccountId, updatedAt: stamp(), executor: "system:account-reconciliation", originalActor: event.data().actor });
      tx.update(eventRef, { reconciled: true, reconciledEpoch: account.epoch });
      return { state: "reconciled", epoch: account.epoch };
    });
  }
  return { register, registrationResult, context, readProfile, saveProfile, addresses, addressMutation, readPreferences, savePreferences, reconcile, ownsResult, myInformation, revokeSessions, staffCustomerInformation, staffDeletedAccount, deletion, lifecycle, optionalCommunicationEligible, importGuestIntent, cleanupDeletedAddresses, reconcileLifecycle, customer, initialize, publishAccess, capture, ref, defaults, keyed, now, db, auth, secret, RESOLUTIONS };
}
