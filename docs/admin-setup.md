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

## Photo storage

Uploads use the authenticated Netlify image function and Netlify Blobs. No Cloudinary upload preset is required.

1. Deploy with the repository's `netlify.toml`, including `netlify/functions`.
2. Set `FIREBASE_WEB_API_KEY` and `FIREBASE_PROJECT_ID` in the Netlify Functions environment, using the same Firebase project as the frontend. Set the `VITE_FIREBASE_*` variables in the build environment and rebuild.
3. Create the active admin membership described above and publish `firestore.rules`. The upload endpoint checks both the signed-in account and its membership.
4. Upload a JPEG, PNG or WebP of at most 4 MiB in a draft product and save. The server validates the photo, removes metadata and converts it to WebP without cropping, limiting its largest dimension to 2400 pixels.
5. Reload the draft, then publish it and confirm its photo is visible on the storefront.

Netlify supplies the deployed Blobs credentials. Do not place service-account keys or private tokens in `VITE_*` variables. For local uploads, run `npx netlify dev` and use port 8888; Vite alone does not provide the function. Local Blobs data is separate from production.

Photo files are public, including photos belonging to drafts. Removing a photo from a record does not delete the file, and a failed save can leave an unattached upload. Clean up only confirmed unused files in the `catalogue-images` Blobs store. Legacy Cloudinary images still render when `VITE_CLOUDINARY_CLOUD_NAME` is configured.

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

## Customer and admin chat

Publish the current `firestore.rules` before enabling chat. A signed-in customer owns one private conversation; active administrators can read and reply through `/admin/chats`.

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
