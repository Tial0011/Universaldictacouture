# Admin setup

Open `/admin`. The admin uses the existing wine, ivory, gold, Cormorant Garamond and Inter design system.

## Firebase Spark

1. Create a Firebase project on Spark and register the web app. Create the default Cloud Firestore database in production mode.
2. Enable Authentication > Email/Password. Add your website domain to Authentication's authorized domains.
3. Put the web app configuration into the existing VITE*FIREBASE*\* variables in .env.local and in your hosting build environment. Rebuild after changing environment variables.
4. Create the administrator in Authentication > Users. Copy its UID.
5. In Firestore create `admins/{UID}` with the boolean field `active: true`. The document ID must exactly match the Auth UID. Do this only in the Firebase Console; the browser cannot create admin memberships.
6. Publish this repository's firestore.rules through the Firebase Console, or deploy only rules with `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`.
7. Visit /admin and sign in with the account created above. To revoke access, set active to false. The next protected database request will be denied even if the admin shell is already open.

Do not give customers membership documents. The route check is for navigation; Firestore rules enforce access to draft documents and writes.

The implementation uses email/password Auth and standard Firestore document operations. It does not require Firebase Storage, Cloud Functions, a paid search service or scheduled jobs. Admin lists request 20 documents at a time, search only loaded records, and refresh explicitly. The overview does not issue count queries or subscribe to collections. Membership checks and rules can incur reads. Existing public catalogue reads are separate from admin reads.

Spark has quotas; this architecture reduces reads but cannot guarantee a site stays within them. Monitor actual usage in Firebase. See [Firebase plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) and [Firestore billing](https://firebase.google.com/docs/firestore/pricing).

## Cloudinary images

1. Create a Cloudinary image upload preset with unsigned signing mode.
2. Restrict allowed formats to jpg, jpeg, png and webp, and maximum file size to 5 MB in the preset. Enable unique filenames and keep overwrite disabled. Set the asset folder to universal-dicta/admin.
3. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in the build environment and rebuild.
4. Upload a photo in a draft product and save. Firestore stores image URLs, public IDs, dimensions and descriptions; image bytes go only to Cloudinary.

Unsigned presets are public and uploads do not inherit Firebase admin authorization. Anyone who learns a preset can use it subject to its restrictions. Monitor Cloudinary usage. If admin-authenticated uploads or API deletion become necessary, add a signed upload endpoint on the existing Netlify hosting layer that verifies Firebase ID tokens and membership; keep the API secret server-side. Do not put API secrets in VITE\_\* variables. See [Cloudinary upload presets](https://cloudinary.com/documentation/upload_presets).

Removing a photo from a record does not delete its Cloudinary asset. A failed save can also leave uploaded assets unattached. Clean up confirmed unused assets in the Cloudinary Console.

## Content workflow

- Products: add a name, price, categories and photos. Save as draft, publish when ready, archive to hide. Existing variant/options metadata is preserved when editing; this first editor manages base pricing and catalogue attributes.
- Categories & attributes: a shared spelling guide for the team. Labels are applied by entering them on products; renaming the guide does not rewrite existing products. Public shop filters come from published product attributes.
- Homepage: manage up to 12 published hero slides. The existing approved CTA links remain unchanged. The custom-style promotion is not edited by this screen.
- Shop discovery: keep one active section per placement (home/shop). Tiles use local links such as /shop?occasion=Bridal and appear in the order added. Existing group metadata is retained.
- Reviews: manually enter genuine feedback and publish/unpublish it. Customer review submission is not implemented here.
- Draft/archived records are private to admins. No hard-delete operations are exposed.

## Verification before launch

With a configured development Firebase project, verify:

1. Signed-out /admin shows sign-in. A customer account cannot access admin or write directly to the content collections.
2. An enabled administrator can add a draft, reload it, edit, publish and archive it. A disabled administrator loses database access.
3. Anonymous queries for published content succeed; draft reads and unfiltered content lists are denied.
4. Publishing updates the storefront; unpublishing hides content. Check public catalogue, hero, discovery and review queries.
5. Test 21+ records to verify Load more, filtered searches and save/refresh behavior.
6. Check mobile navigation, keyboard focus, unsaved-change prompts and error handling offline.

Rules and service integration need to be verified against your project before production. No remote project settings or rules are deployed automatically by this change.
