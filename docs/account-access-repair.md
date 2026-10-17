# Existing account access repair — 9 October 2026

## Scope and evidence

Baseline: branch `main`, commit `d63664b`. Only `artifacts/` was untracked before this repair and was left untouched.

The owner reported failures at `https://universaldictacouture.netlify.app/admin`, Shop, New In, Custom Style and existing accounts. Read-only live requests to the account Function (`catalogue` and `context`) returned HTTP 502, with `ERR_REQUIRE_ESM` from `jwks-rsa` requiring `jose`. The SPA still returned HTTP 200. This was a shared trusted-backend startup failure, not evidence that Products or users had been deleted.

Separate source defects were confirmed:

- Existing Firebase principals could lack the newer durable Account bindings; legacy admin grants did not cover newer owner services.
- Multiple private hooks could compete to admit the same browser session.
- An unavailable managed-session endpoint could prevent local sign-out.
- Profile Overview always displayed unavailable, even when Profile data loaded. Personal Details remained a disabled placeholder despite the existing versioned save service.

## Implemented behavior

- Keep Firebase Admin 14.5.0; pin its nested JWKS dependency to compatible 3.2.0. Test actual signed JWT verification and every Function import with `require(ESM)` disabled. Function startup is now part of every production build.
- Coalesce session admission by principal and Customer/Staff domain. Discard old-principal responses. Allow local sign-out during server outages without claiming remote revocation.
- Provide a trusted, default-dry-run repair for existing Firebase UIDs. Preserve original principals, historical records, private legacy Profile text and valid existing bindings. Refuse ambiguous/deleted/restricted identity reconstruction. No new Firebase login accounts or passwords are created by this repair.
- Promote existing active admins to explicit Super Admin capability profiles, including payment proof/verification and financial administration. Preserve domain validation and Customer approval boundaries.
- Bind `universaldictacouture@gmail.com` and `akinolachris8@gmail.com` to protected Owner records using their actual Firebase UIDs. Email strings in client code do not grant Owner authority.
- Either owner can independently suspend/restore other admins, enable/disable all capabilities or toggle a specific capability at `/admin/settings/admins`. No second-owner approval. Fresh authentication, expected access version, operation identity and result reconciliation are enforced on the server. Suspension and reactivation invalidate older Staff authentication.
- Show a truthful loaded Profile and connect Personal Details to the existing versioned save endpoint. Preserve entered text on conflict, require explicit reload, reconcile lost acknowledgements, and partition private work by principal.

## Source change manifest

Paths are relative to this repository. No source files were deleted.

| File | Change / cross-section impact |
| --- | --- |
| `package.json` | Function startup build guard, focused account test command, compatible server dependency pin; all Functions |
| `package-lock.json` | Reproducible dependency resolution; Section 16 runtime |
| `firestore.rules` | Current Staff `validAfter` enforcement while retaining valid legacy compatibility; Sections 12/16 |
| `netlify/lib/account-handler.js` | Owner management read/write/reconcile actions through existing authenticated boundary |
| `netlify/lib/account-sessions.js` | Reuse current durable Staff authorization for session admission |
| `netlify/lib/staff-authority.js` | Explicit domain-wide data-purpose/governance routes, still exact-purpose/field checked |
| `netlify/lib/communication-service.js` | Authorized delivery-evidence listing for explicit broad grants; Section 15 |
| `netlify/lib/existing-account-repair.js` (new) | Transactional, replay-safe Customer/Staff continuity repair; Sections 11/12/16 |
| `netlify/lib/staff-management.js` (new) | Owner-only current capability management and immutable operation evidence |
| `scripts/check-function-startup.mjs` (new) | Import deployed Function entry points without executing business actions |
| `scripts/repair-existing-accounts.mjs` (new) | Exact-project, dry-run-first operator repair; no public migration endpoint |
| `src/services/accountApi.js` | Shared session admission, account-switch isolation and outage-safe local sign-out |
| `src/services/staffAuthorization.js` | Render current explicit Super Admin/Owner grants and invalidate changed permission state |
| `src/services/superAdminPolicy.js` (new) | Central explicit capability registry with owner-controlled exclusions |
| `src/App.jsx` | Add owner management route within the existing Admin shell |
| `src/pages/admin/Settings/Settings.jsx` | Owner-only permission-management entry |
| `src/pages/admin/Settings/StaffAccess.jsx` (new) | Owner controls, confirmation, stale/unknown result handling |
| `src/pages/Profile/Profile.jsx` | Wire confirmed Profile to existing owner-service editing |
| `src/pages/Profile/ProfileContent.jsx` | Remove false unavailable message for loaded Profile |
| `src/pages/Profile/ProfileDetailsEditor.jsx` (new) | Versioned text-field saves, conflict and unknown-result recovery |
| `tests/account-continuity-repair.test.mjs` (new) | Existing identity repair, real token/session admission, capability changes and races |
| `tests/account-session-client.test.mjs` (new) | Session coalescing, account switching, outage sign-out |
| `tests/account-owner-rules.test.mjs` (new) | No direct owner self-promotion; stale-token denial in real Rules |
| `tests/function-startup.test.mjs` (new) | Lambda-compatible imports and real RSA/JWKS verification |
| `tests/account-repair-browser.mjs` (new) | Real local UI/API/Rules flows using repaired pre-existing-account fixtures |
| `tests/section11-visual.test.mjs` | Loaded Profile truthfulness regression |
| `AGENTS.md` (new) | Future-feature account continuity and validation guardrails |
| `docs/account-access-repair.md` (new) | This evidence and rollout record |

New private data shapes: `staffOwners/{principalUid}`, `staffAccessOperations/{operationId}`, protected `identityMigrationEvidence` repair records and explicit admin membership fields (`accessProfile`, `accessVersion`, `paymentReview`, `adminContactEmail`, `disabledCapabilities`, `allCapabilitiesDisabled`, `validAfter`). Existing Account/Staff services remain owners; these are not duplicate business systems. No Storage Rules, indexes or payment/order historical schemas changed.

## Validation record

- Final full automated suite: **483/483 passed**, zero failures/skips (321.1 seconds). Earlier pre-Profile run also passed 480/480.
- `npm run test:accounts`: **24/24 passed**, including real Firestore Rules owner self-promotion denial, stale-token denial and Profile presentation regression.
- `node tests/account-repair-browser.mjs`: passed both independent owners, non-owner denial, repaired existing customer/admin sign-in, Shop/New In, Profile persistence with lost acknowledgement/reconciliation, account-switch isolation, 320/768/1440px, 200% reflow and no uncaught runtime exceptions. This uses local emulators and synthetic data, not production users.
- `npm run build`: passed, including imports of `account.js`, `images.js` and `owner-maintenance.js`. Existing NotificationCentre static/dynamic import warning remains.
- `npm run lint`: exit 0. Existing baseline warnings remain; no new repair-file warning was present.
- `npm audit --omit=dev`: zero known production dependency vulnerabilities at verification time.
- `git diff --check`: no patch whitespace errors; local LF/CRLF notices only.
- `node scripts/repair-existing-accounts.mjs --project=signin-92937`: default dry-run preflight could not start because server runtime credentials/configuration are absent locally. It reported **no accounts changed**.

Full suite command (PowerShell):

```powershell
$repairTests = @(rg --files tests | Where-Object { $_ -match '\.test\.mjs$' })
node --experimental-vm-modules --test --test-concurrency=1 @repairTests
```

Focused future command: `npm run test:accounts` (Auth emulator 9099, Firestore emulator 8089). Browser command additionally needs the existing local Vite fixture on 5182, `scripts/section16-emulator-server.mjs` on 5183 and isolated Chrome CDP on 9228.

## Production activation

The owner explicitly approved deployment and the one-time live account repair during this task. No commit or push is authorized or necessary. Initial preflight found no CLI login or server Firebase configuration. A secure Netlify login was subsequently approved, but it belongs to `akinolachris8`'s hosting team, not the site's `tial0011` team. The exact site resolves through its public metadata, while its protected Functions endpoint returns HTTP 401. Project listings for the authorized login are empty. This is a hosting permission blocker, not failed user approval or proof that server environment variables are missing.

The repository is locally linked to the verified existing site ID `2f1d0cf5-9f0c-4d7a-a104-2923696490ac` (ignored `.netlify/state.json`). The production frontend build targets Firebase `signin-92937` with no emulator flag. Runtime project/environment matching still requires the actual site owner's access. A second secure login request was issued for that account. No production deployment, Rules release or account migration has occurred.

1. Authenticate Netlify CLI securely through its normal browser login. Verify the exact existing site is `universaldictacouture.netlify.app`; never create a replacement site.
2. Verify live Functions environment names/scopes without printing secret values: `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, stable `UDC_IDENTITY_HMAC_KEY`, `UDC_SITE_ORIGIN`. Frontend `VITE_FIREBASE_*` configuration is not a substitute. Do not rotate the identity HMAC key: existing bindings/proof/session evidence depend on it.
3. Verify the exact live Firebase project from current site configuration, not this example command alone. Run the repair dry-run; review any conflicts before applying. Back up affected membership/binding records through an authorized secure process.
4. Deploy the tested Functions/client and verified compatible Firestore Rules to those exact existing targets. Confirm that unauthenticated catalogue works and private endpoints return privacy-safe auth errors, not Lambda crashes.
5. Run `node scripts/repair-existing-accounts.mjs --project=<verified-project> --apply` using protected server credentials. Inspect aggregate results; conflicts are not silently bypassed. Replays preserve later owner permission decisions.
6. Both owners sign in freshly. Verify their protected owner records, current capability state, payment access and independent permission controls. Test existing Customer access and public Shop/New In/Custom Style. Never ask for a user password in chat.

Netlify documents CLI browser authentication and secure local token storage in its [CLI guide](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/). Its [Function configuration guide](https://docs.netlify.com/build/functions/configuration/) distinguishes build Node version from deployed runtime configuration; verify actual runtime as part of rollout.

## Honest limits

- This is an account/runtime compatibility repair, not completion of every unfinished owner-domain screen. Saved Addresses, communication/privacy/security subpanels and Profile photo editing still contain earlier disabled placeholders; some Admin domain destinations remain dependent on their owning workstream.
- Owner management currently exposes the first 100 admin memberships and labels that bound; additional paging is not implemented. This is not an unlimited directory.
- Actual outbound verification/reset Email delivery is not certified without the production proof-delivery adapter/configuration. Local tests use a synthetic adapter and send no Customer email.
- Legacy private transaction/saved-data ownership is preserved, not indiscriminately reassigned by mutable email. Ambiguous records require explicit owner-domain reconciliation.
- Security tests cannot prove every possible future feature correct. The new build/account regression guards are a required continuity checkpoint, not a promise of zero future bugs.

## Final rollout outcome

Pending authorization from the Netlify account with access to the `tial0011` team, followed by protected runtime/configuration preflight. Both secure authorization attempts completed as the same `akinolachris8@gmail.com` hosting account. A fresh recheck still listed only that account's team and returned HTTP 401 for the UDC Functions endpoint. Another approval under that same unchanged hosting account will not resolve this; it needs access granted by the owning team or login as an existing team member. Local source repair is implemented and tested; production migration has not been executed as of this record.

The user requested a continuously updating local preview. The existing Vite server on `http://127.0.0.1:5182/tests/section11-browser.html?route=/` provides hot updates against local Auth/Firestore/API emulators and synthetic test data. It is intentionally not a mirror of real private production accounts. Keep its local services running while the owner uses that preview.
