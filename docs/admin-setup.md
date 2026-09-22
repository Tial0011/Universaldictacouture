# Admin setup

Open `/admin`. The admin uses the existing wine, ivory, gold, Cormorant Garamond and Inter design system.

## Firebase Spark

1. Create a Firebase project on Spark and register the web app. Create the default Cloud Firestore database in production mode.
2. Enable Authentication > Email/Password. Add your website domain to Authentication's authorized domains.
3. Put the web app configuration into the existing VITE_FIREBASE_* variables in .env.local and in your hosting build environment. Rebuild after changing environment variables.
4. Create the administrator in Authentication > Users. Copy its UID.
5. In Firestore create `admins/{UID}` with the boolean field `active: true`. The document ID must exactly match the Auth UID. Do this only in the Firebase Console; the browser cannot create admin memberships.
6. Publish this repository's firestore.rules through the Firebase Console, or deploy only rules with `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`.
7. Visit /admin and sign in with the account created above. To revoke access, set active to false. The next protected database request will be denied even if the admin shell is already open.

Do not give customers membership documents. The route check is for navigation; Firestore rules enforce access to draft documents and writes.

The implementation uses email/password Auth and standard Firestore document operations. It does not require Firebase Storage, Cloud Functions, a paid search service or scheduled jobs. Admin lists request 20 documents at a time, search only loaded records, and refresh explicitly. The overview does not issue count queries or subscribe to collections. Membership checks and rules can incur reads. Existing public catalogue reads are separate from admin reads.

Spark has quotas; this architecture reduces reads but cannot guarantee a site stays within them. Monitor actual usage in Firebase. See [Firebase plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) and [Firestore billing](https://firebase.google.com/docs/firestore/pricing).

## Netlify image storage

New uploads use Netlify Blobs through the authenticated images function. Firebase still handles email/password sign-in, admin memberships and catalogue records; Firebase Storage and Cloudinary upload presets are not needed.

1. In Netlify project environment variables, set FIREBASE_WEB_API_KEY to the same value as VITE_FIREBASE_API_KEY, and FIREBASE_PROJECT_ID to the same value as VITE_FIREBASE_PROJECT_ID. Include the **Functions** scope. Keep the existing VITE_FIREBASE_* values available to the build as well.
2. Publish firestore.rules and create the active admin membership described above. The upload function verifies the Firebase ID token and reads admins/{UID} using that user's Firestore permissions. It never uses a service-account database bypass.
3. Deploy the code to Netlify. Netlify supplies Blobs credentials automatically to its functions. The site-wide catalogue-images store is created on the first successful upload and persists across deployments.
4. Sign in at /admin, upload a JPEG, PNG or WebP photo up to **4 MB**, then save the draft product. The function checks the actual image, removes metadata and converts it to WebP at a maximum of 2400 pixels per side.
5. Verify the photo after refreshing the editor and publishing the product.

For local uploads, run **npx netlify dev** from this project and open **http://localhost:8888/admin**. It runs Vite and Netlify Functions together. The normal npm run dev command runs only the frontend. Local Blobs data is separate from the deployed store; locally uploaded images do not migrate automatically to production.

Photo URLs are public, including photos attached to draft records; do not upload private customer documents. Only active admins can upload, and the function does not expose listing or deletion. Removing a photo from a record keeps its stored file. Clean up confirmed unused files from the Netlify Blobs UI; removed images can remain cached for up to one day. Failed record saves can leave unattached photos.

Previously stored Cloudinary URLs are retained. The legacy URL helper supports old public IDs if VITE_CLOUDINARY_CLOUD_NAME is present. Existing remote files are not automatically migrated or deleted.

Netlify usage and plan limits apply to functions and image delivery. This change does not change your Firebase Spark plan or buy a Netlify plan. Check your account's actual allowances: [Netlify pricing](https://www.netlify.com/pricing/), [Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/), [function upload limits](https://docs.netlify.com/build/functions/configuration/).

## Content workflow

- Products: add a name, price, categories and photos. Save as draft, publish when ready, archive to hide. Existing variant/options metadata is preserved when editing; this first editor manages base pricing and catalogue attributes.
- Categories & attributes: a shared spelling guide for the team. Labels are applied by entering them on products; renaming the guide does not rewrite existing products. Public shop filters come from published product attributes.
- Homepage: manage up to 12 published hero slides. The existing approved CTA links remain unchanged. The custom-style promotion is not edited by this screen.
- Shop discovery: keep one active section per placement (home/shop). Tiles use local links such as /shop?occasion=Bridal and appear in the order added. Existing group metadata is retained.
- Reviews: manually enter genuine feedback and publish/unpublish it. Customer review submission is not implemented here.
- Draft/archived records are private to admins. No hard-delete operations are exposed.

## Verification before launch

Run `npm ci`, `npm run lint`, `npm run build`, and `node --test tests/admin-model.test.mjs tests/image-storage.test.mjs`.

With a configured development Firebase project, verify:
1. Signed-out /admin shows sign-in. A customer account cannot access admin or write directly to the content collections.
2. An enabled administrator can add a draft, reload it, edit, publish and archive it. A disabled administrator loses database access.
3. Anonymous queries for published content succeed; draft reads and unfiltered content lists are denied.
4. A valid image uploads to Netlify. Invalid/oversized files, signed-out uploads and non-admin uploads are rejected by the server.
5. Publishing updates the storefront; unpublishing hides content. Check public catalogue, hero, discovery and review queries.
6. Test 21+ records to verify Load more, filtered searches and save/refresh behavior.
7. Check mobile navigation, keyboard focus, unsaved-change prompts and error handling offline.

Rules and service integration need to be verified against your project before production. No remote project settings or rules are deployed automatically by this change.
