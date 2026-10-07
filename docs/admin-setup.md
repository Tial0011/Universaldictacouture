# Admin setup

Open `/admin`. The admin uses the existing wine, ivory, gold, Cormorant Garamond and Inter design system.

Section 12's final architecture requires durable Staff Identity and explicit capability/purpose/scope grants. The owner's temporary development decision now preserves existing active legacy `admins/{uid}` memberships through the central [development compatibility bridge](admin-development-compatibility.md). Only memberships with **both** `staffId` and `capabilities` absent qualify; canonical and partial-migration records never receive fallback grants. Firebase authentication and current server membership checks remain required. This is not customer access or a permanent Staff migration. Read [the access contract](section12-access-contract.md) before rollout. Production deployment and real membership changes were not performed during this repair.

## Firebase Spark

1. Create a Firebase project on Spark and register the web app. Create the default Cloud Firestore database in production mode.
2. Enable Authentication > Email/Password. Add your website domain to Authentication's authorized domains.
3. Put the web app configuration into the existing VITE*FIREBASE*\* variables in .env.local and in your hosting build environment. Rebuild after changing environment variables.
4. Create the administrator in Authentication > Users. Copy its UID.
5. Provision the existing `admins/{UID}` principal binding with a reviewed durable `staffId`, current `active` access and explicit `capabilities` routes described in the access contract. Do not automatically convert role labels into grants. Browser clients cannot create or change memberships. Full protected governance, unique-human provisioning and maximum-two Super Admin enforcement remain owner dependencies.
6. Publish this repository's firestore.rules through the Firebase Console, or deploy only rules with `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`.
7. Visit /admin and sign in with the account created above. To revoke access, set active to false. The next protected database request will be denied even if the admin shell is already open.

Do not give customers membership documents. The route check is for navigation; Firestore rules enforce access to draft documents and writes.

The implementation uses Firebase Auth, Firestore SDK operations and authenticated Firestore REST field projections. Operational lists request 20 records at a time; Search covers loaded pages and supports exact reference lookup. Staff membership is subscribed to for current access, and Product saves write an atomic audit receipt. These operations add reads/writes. Existing public catalogue reads are separate. Full owner-domain search and absent transaction systems are not implemented by this shell.

Spark has quotas; this architecture reduces reads but cannot guarantee a site stays within them. Monitor actual usage in Firebase. See [Firebase plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) and [Firestore billing](https://firebase.google.com/docs/firestore/pricing).

## Photo storage

Uploads use the authenticated Netlify image function and Netlify Blobs. No Cloudinary upload preset is required.

1. Deploy with the repository's `netlify.toml`, including `netlify/functions`.
2. Set `FIREBASE_WEB_API_KEY` and `FIREBASE_PROJECT_ID` in the Netlify Functions environment, using the same Firebase project as the frontend. Set the `VITE_FIREBASE_*` variables in the build environment and rebuild.
3. Provision explicit `media.upload` / `public-media` authority as described in the access contract. The upload endpoint verifies current account and staff capability. Physical deletion is blocked pending reference-aware owner cleanup.
4. Upload a JPEG, PNG or WebP of at most 4 MiB in a draft product and save. The server validates the photo, removes metadata and converts it to WebP without cropping, limiting its largest dimension to 2400 pixels.
5. Reload the draft and verify current scoped access. Publish/Update Live are blocked in the retained editor until the Section 13 protected Working/Live and complete-readiness workflow is integrated. Do not use the public upload endpoint for private customer/media evidence.

Netlify supplies the deployed Blobs credentials. Do not place service-account keys or private tokens in `VITE_*` variables. For local uploads, run `npx netlify dev` and use port 8888; Vite alone does not provide the function. Local Blobs data is separate from production.

Photo files are public, including photos belonging to drafts. Removing a photo from a record does not delete the file, and a failed save can leave an unattached upload. Clean up only confirmed unused files in the `catalogue-images` Blobs store. Legacy Cloudinary images still render when `VITE_CLOUDINARY_CLOUD_NAME` is configured.

## Content workflow

- Products: private Draft/Unpublished editing requires independently reviewed create/content/commercial/media/discovery capabilities for the affected fields. Existing Published data is read-only; generic live saves and publication are blocked pending the protected owner pipeline. Unpublish → Unpublished; Restore → Unpublished; Archive preserves identity/history. Each supported consequential save/transition has current-state/version checks and private Audit evidence.
- Categories & attributes: a shared spelling guide for the team. Labels are applied by entering them on products; renaming the guide does not rewrite existing products. Public shop filters come from published product attributes.
- Homepage: manage up to 12 published hero slides. The existing approved CTA links remain unchanged. The custom-style promotion is not edited by this screen.
- Shop discovery: keep one active section per placement (home/shop). Tiles use local links such as /shop?occasion=Bridal and appear in the order added. Existing group metadata is retained.
- Reviews: read permitted operational state. Legacy Admin review mutation is blocked pending the consent/version/eligibility-aware owner workflow; old quality ratings are not converted into service ratings.
- Draft/Unpublished/Archived records require current scoped staff authority. Product/Review hard deletion is blocked. Existing permitted content deletion remains owner-controlled.

## Verification before launch

With a configured development Firebase project, verify:

1. Signed-out /admin shows sign-in. A customer account cannot access admin or write directly to the content collections.
2. Staff with the exact reviewed capabilities can create/edit private Drafts, reload them and perform permitted Archive/Unpublish/Restore. Inactive staff lose protected access. Protected publication needs the missing Section 13 pipeline and must not be tested through the old generic save path.
3. Anonymous queries for published content succeed; draft reads and unfiltered content lists are denied.
4. Existing eligible Published catalogue remains public; protected Unpublish/Archive removes discovery without rewriting history. Check public content reads. New Product publication and Review moderation remain blocked owner dependencies.
5. Test 21+ records to verify Load more, filtered searches and save/refresh behavior.
6. Check mobile navigation, keyboard focus, unsaved-change prompts and error handling offline.

Rules and service integration need to be verified against your project before production. No remote project settings or rules are deployed automatically by this change.

## Customer and admin chat

The existing general Chat is retained. Canonical Staff need independent current `chats.read` and `chats.reply` grants in `customer-service` purpose and applicable resource scope. Eligible legacy development memberships receive those specific effective grants from the temporary central bridge. Dedicated Main Order Chats and owner assignment workflows remain external dependencies.

1. Send a message as a customer and open that conversation in the admin inbox.
2. Reply as an admin and confirm that the reply appears for the customer without reloading.
3. Verify that a second customer cannot read or write the first customer's conversation.
4. Check message history beyond 30 messages and inbox pagination beyond 20 conversations.
5. Disable an admin membership and confirm that protected requests are denied.
6. Prepare a Custom Style enquiry or select My Closet's “Ask about these pieces”. If signed out, sign in and confirm the draft is preserved. Review it and send explicitly; it must never be sent automatically.

The automated rules tests require the local Firestore emulator and Java 21+. They never run against production data. Use the emulator command in the root README.

## Account email actions

Password reset is available from “Forgot your password?” on `/signin`. Signed-in customers can send a verification email and refresh its status from `/profile`. These actions use Firebase Authentication's hosted action pages; the website does not collect email action codes itself.

1. Configure the Authentication email templates for the brand and check the authorized domains for the deployed site.
2. Request a reset for a test account, open its email, set a new password and sign in with it. The reset form deliberately does not reveal whether an address is registered.
3. Send a verification email, open its link, then select “Check verification” on the account page.
4. Test a failed network request and excessive attempts. A failed request must show an error rather than claim an email was sent.

These checks require the actual Firebase project and a test inbox. A local production build cannot prove email delivery.
