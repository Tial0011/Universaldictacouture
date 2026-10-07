# Development Admin compatibility repair

Owner-authorized temporary bridge, 2026-10-07. Scope: restore the existing development Admin workspace without redesigning Staff or customer Account authority. No push, production deployment, real account migration or production data mutation was performed.

## A. Root cause

The historical Admin contract accepted Firebase authentication plus an existing `admins/{uid}` record with `active: true`. Current Staff guards and Rules introduced a nonempty `staffId` and capability routes before legacy memberships were migrated. Successful authentication could therefore reach a denied workspace. Repository history and code confirm this schema incompatibility; live production membership records were not inspected.

## B. Changed files

- `src/services/staffAuthorization.js`: one normalization adapter, fixed effective capability contract, membership-state classification and compatibility-aware fingerprint.
- `src/services/admin.js`: normalize fresh membership subscriptions/checks and transaction commit-time authority.
- `src/services/operations.js`: normalize authoritative membership reads before existing scoped queries.
- `netlify/lib/image-storage.js`: use the same adapter for trusted public-media uploads.
- `src/components/admin/AdminAccess.jsx`: distinguish absent, inactive and incomplete migration states; successful legacy access uses the normal Staff provider.
- `firestore.rules`: matching narrow legacy capability/purpose checks and effective actor attribution; retain membership non-escalation and owner data boundaries.
- `tests/staff-fixtures.mjs`, `tests/section12-rules.test.mjs`: legacy fixture and the superseded legacy-denial assertion updated to the owner's decision.
- `tests/admin-compatibility.test.mjs`, `tests/admin-compatibility-rules.test.mjs`, `tests/admin-compatibility-browser.mjs`: focused model, trusted media, real Rules and actual-app browser regressions.
- `tests/section12-browser-entry.js`: isolated test-only reload can preserve its synthetic session while reconnecting emulators. Production entry is unchanged.
- `tests/admin-compatibility-reload.html`: emulator-only reload document; the browser runner routes only its own local `/admin` document request through this fixture.
- `docs/admin-setup.md`, `docs/section12-access-contract.md`, this document: current exception, rollout and removal checkpoint.

## C. Legacy behavior

`normalizeStaffMembership(uid, rawAdminRecord)` is used only after reading the existing authenticated principal's Admin membership. Compatibility requires `active === true` and **absence of both** `staffId` and `capabilities`. A title such as Admin/Super Admin is neither necessary nor sufficient. An inactive membership, customer Profile, missing membership, malformed record or partial canonical migration cannot receive fallback authority.

The effective context has `compatibilityMode: "legacy-development-admin"`, a temporary `legacy-dev:{uid}` attribution alias and the frozen `DEVELOPMENT_LEGACY_ADMIN_CAPABILITIES` contract. It does not write back to `admins`, create a second identity or migrate any account. Audit records retain the actual principal UID and the truthful effective alias used at commit; later migration must not relabel existing evidence.

Effective grants permit Product inspection/private Draft editing and existing unpublish/archive/restore; existing content work; read-only Review visibility; existing General Chat reading/replying; public catalogue/content uploads; Audit reading and own-operation reconciliation. Read grants open existing customer/order/payment/Custom Style operational entry points, but missing owner integrations remain explicitly unavailable. They do not unlock absent customer/transaction data.

This does **not** reopen protected Product publication/deletion, Review moderation/publication, Payment verification, private-media access, assignment/governance or blocked customer workflows. Current owner state, transaction version, immutable Audit and unknown-outcome protections remain applicable.

## D. Canonical behavior

Canonical records are returned unchanged. Existing narrow capability/purpose/scope routes and zero-capability memberships retain their exact behavior. Having canonical fields prevents legacy fallback even when their values are empty/null/incomplete. A partial migration requires trusted review rather than inferred broader permission.

## E. Non-admin denial

Firebase authentication alone never suffices. Membership retrieval is restricted to the caller's own `admins/{uid}` document. Membership listing, client creation, editing, deletion and self-escalation remain denied. Current inactive access denies protected reads/writes; membership changes withdraw the existing workspace through the existing subscription. Sign-out and principal changes rerun the existing access boundary.

## F. Rules alignment

The Rules bridge enumerates the same exact capability/purpose pairs as the JS contract; regression tests compare both lists. Product and Chat commits use the effective attribution alias only for the eligible legacy principal, still with atomic immutable Audit evidence. Customer Profile/saved-data/transaction rules were not widened. The unfinished Section 16 customer Account authority remains a separate dependency, not a component of this fix.

## G–H. Validation

- `node --experimental-vm-modules --test --test-reporter=spec` over all `tests/*.test.mjs`: **268 passed, 0 failed, 0 skipped**, using local Firestore namespaces. Expected denied-operation logs are assertions, not accepted writes.
- New focused model/trusted-media tests: **7 passed**. New focused Rules tests: **5 passed** (included in 268).
- `npm run lint`: exit 0; **34 existing warnings, 0 errors**. No lint findings in the repair's changed implementation files.
- `npm run build`: production build passed.
- `git diff --check`: passed (Git emitted only line-ending notices).
- `node tests/admin-compatibility-browser.mjs`: **passed**. Canonical Staff and two legacy admins sign in, open backed owner destinations, reload, sign out and sign back in; switching to a customer denies access; inactive membership is denied; mid-session deactivation withdraws the workspace and reactivation is re-evaluated. Canonical grants remain unchanged and legacy memberships still contain no fabricated identity/capability fields. **0 runtime exceptions**. The isolated emulator-only Vite fixture uses local Auth 9099, Firestore 8089 and test-only Chrome CDP 9227. Results are recorded locally in `.tools.local/admin-compatibility-browser-result.json`; this file contains synthetic QA outcomes, not production evidence. CDP reload routing keeps the test app connected to emulators, not production Firebase endpoints.

The verification skill guided end-to-end checks rather than accepting a rendered shell as proof of data authorization. No new hosting provider was introduced.

## I. Deployment — required separately

**A GitHub push / Netlify website deployment does not deploy Firestore Rules.** Deploy both the repaired frontend/Netlify function and `firestore.rules`; either one alone can leave service requests denied. Firebase's [Rules deployment documentation](https://firebase.google.com/docs/firestore/security/get-started) governs publishing Rules.

1. Review this diff and verify the intended production Firebase project. Local `.env.local` identifies `signin-92937`; confirm the deployed `VITE_FIREBASE_PROJECT_ID` and Netlify Functions `FIREBASE_PROJECT_ID` match it. Do not deploy the emulator's `demo-*` project.
2. Push the reviewed code through your normal workflow and confirm the Netlify build/functions rollout succeeds. No push was performed here.
3. From this repository root, with Firebase CLI installed and authorized, deploy Rules separately:

```powershell
firebase login
firebase deploy --only firestore:rules --project signin-92937
```

If production uses a different verified project ID, replace `signin-92937` before executing. There is no `.firebaserc` project alias in this repository. The command deploys the repository's `firestore.rules` through `firebase.json`, not a generic permissive replacement.

4. Wait for Rules propagation and refresh `/admin`. Check the owner and another existing legitimate active Admin: login, existing pages/data, refresh, sign-out, sign-in. Confirm a normal customer is denied. Use read-only production inspection; do not mutate real transaction data for validation.
5. If access still fails, distinguish missing/inactive/partial membership, session denial, source failure, wrong Firebase project and stale Rules. Inspect only through an already-authorized console/governance process. Do not create customer memberships or delete canonical fields to force broader fallback.

The broad fallback applies to every active fieldless Admin membership until retirement; trusted membership administrators must not provision new fieldless records as an escalation shortcut. Client Rules cannot prove historical membership creation dates that the legacy schema did not capture.

## J. Removal checkpoint

**Remove legacy-development-admin compatibility only after all production admins have reviewed canonical Staff Identity + explicit capability records.** Migration is a separate controlled operation, not this adapter.

Inventory memberships using trusted owner tooling, assign/review the same human's durable Staff identity, populate explicit grants, preserve actor/history evidence and verify each account without fallback. Review session revocation/forced re-login with the owner if needed. Then remove the JS adapter/grants and matching Rules branch together, update fixtures/tests/docs and rerun positive canonical and negative access tests before rollout. Do not remove only one side or erase historical legacy attribution aliases.

Local verdict: **PASS for this compatibility repair**; **live production restoration remains pending the owner's code + Rules rollout**. This does not claim final Section 11/12/16 completion or resolve their previously documented owner dependencies.
