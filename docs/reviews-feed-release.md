# Reviews & Feeds release checks

The feed, homepage preview and Saved Reviews use the same responsive masonry cards. Phones retain two columns. Written reviews have no empty photo area; photo stories use a portrait frame. The existing menu weave is reused for the background.

## Deployment order

1. Test and deploy `firestore.rules` to the existing Firebase project before deploying the frontend. The optional bounded `productContext` field is required for tagged chat messages. Older text-only messages remain compatible. No conversation access permissions are widened.
2. Build and deploy the frontend to the existing Netlify site through the normal release process.
3. Add product descriptions in Admin → Products where needed. Legacy products share their existing attributes instead of invented descriptions.

Do not deploy just the frontend with the old message rules: tagged chat sends would be rejected. No production deploy is performed by the code changes alone.

## Checks

- Save a review, refresh, and open My Closet → Saved Reviews. Unsave and refresh again.
- Like a review’s piece and open My Closet → My Pieces. Verify guest-to-account transfer and offline account recovery.
- Open Chat from a review while signed out; sign in. Review the tag, edit the message, send, and verify the same tag above the text in the admin inbox and after refresh.
- Remove the tag before sending and verify an ordinary text-only message still works.
- Share a product and a review: name, brand, description/attributes, price, then labelled links. Cancel a native share; it must not open another prompt.
- Check 320, 390, 768 and 1440 pixel viewports with photo-only, written-only and mixed feeds, long names, expanded reviews and missing products.

The dev-only `/tests/review-ui.html` fixture exercises mixed and long-content layouts without changing real reviews. It is not imported by the production build.

Unit tests: `node --test tests/chat-model.test.mjs tests/share-content.test.mjs tests/product-model.test.mjs tests/admin-model.test.mjs tests/review-model.test.mjs tests/saved-review-store.test.mjs`

Rules tests require the Firebase Firestore emulator on port 8089: `node --test tests/chat-rules.test.mjs`.

## Local verification performed

- Production build passes; all 37 relevant unit tests pass. Existing application lint warnings remain; the new grid, sharing helper and product-tag component lint cleanly.
- Isolated browser checks cover 320–1440px layouts, two-column mobile cards, expanded text without overlap, guest bookmark persistence and Saved Reviews, guest likes, review-to-chat context and the sign-in handoff.
- The homepage renders without a framework overlay, but its existing content requests log Firebase permission errors; a plain Vite server also cannot serve the Netlify image function. These are not evidence of a successful production integration test.
- The Firestore emulator/Java runtime was unavailable, so the added security-rule tests were not run. Sending tagged messages as an authenticated customer and reading them in the admin inbox still requires account-level verification.
- Nothing was pushed or deployed to Firebase or Netlify.
