# TODO — Universal Dicta Couture

This list separates work already supported in the code from setup and owner work that still needs a real environment. Do not mark a cloud task complete until it is verified in the intended Firebase or Netlify project.

## Before launch

- [ ] Fill the local `.env.local` values from `.env.example`; keep it out of Git.
- [ ] Set Firebase web configuration and server-only Function secrets in the correct Netlify scopes.
- [ ] Confirm Firebase Email/Password sign-in and authorized domains for local and live sites.
- [ ] Start local Auth emulator on `127.0.0.1:9099` and Firestore emulator on `127.0.0.1:8089`.
- [ ] Run account continuity, Firestore rules, image-storage and relevant browser checks against the emulators.
- [ ] Review/publish the current Firestore rules to the intended project after emulator verification.
- [ ] Verify Netlify Functions and Netlify Blobs with an authenticated image upload in a non-production environment.
- [ ] Verify existing customer and staff accounts retain their Firebase principals and durable bindings.
- [ ] Complete customer registration, sign-in, password reset, staff authorization and denied-customer admin route checks.
- [ ] Test key customer and staff routes on desktop and mobile.
- [ ] Obtain current owner authorization before any production deployment or live data migration.

## Owner-dependent product work

- [ ] Complete the protected Product publication workflow before enabling publish/update-live actions.
- [ ] Complete the consent, version and eligibility-aware review owner workflow before enabling review submission or moderation writes.
- [ ] Confirm remaining staff capabilities and source integrations before exposing customer, payment, order or custom-style operational workspaces as available.
- [ ] Decide whether and how existing image records that contain Cloudinary public IDs should be migrated to direct Netlify image URLs. Cloudinary delivery has been removed from the app.
- [ ] Define a safe cleanup process for confirmed unused Netlify Blobs images; deleting a reference must not silently delete shared media.

## Future product improvements

- [ ] Add checkout and payment integration only after business, security and provider requirements are approved.
- [ ] Add order tracking only after an authoritative order workflow exists.
- [ ] Add customer review submission only after purchase eligibility and consent checks are implemented.
- [ ] Add server-side catalogue pagination if catalogue size/Firestore reads warrant it.
- [ ] Decide whether chat attachments, read receipts or email notifications are needed.

## Ongoing maintenance

- [ ] Review Netlify usage and Firebase quotas after catalogue or traffic changes.
- [ ] Keep dependency lockfile current and review dependency security advisories.
- [ ] Keep setup guides and this TODO aligned with what has actually been deployed.
