# Universal Dicta Couture

A React storefront and protected admin workspace for Universal Dicta Couture. Customers browse published pieces, create accounts, save favourites and contact the brand. Administrators manage products, photos and storefront content within the same application.

## What is implemented

- Public catalogue, product details, filtering, homepage content and published reviews backed by Firestore. The shop stays empty until real products are published; there is no mock catalogue fallback.
- Customer email/password registration at `/signup`, sign-in and password reset at `/signin`, and account details with email-verification controls at `/profile`.
- My Closet → My Pieces stores saved products per signed-in customer in Firestore. Guest saves use browser session storage.
- My Closet with selected products and quantities, stored for the browser session and separated by account. Guest selections are not automatically merged after sign-in.
- The studio workspace is available at `/admin` to users with an active admin membership, not just a customer account. It is not linked from customer navigation.
- Admin screens for products, categories and attributes, homepage banners, discovery tiles, reviews and setup information.
- Private customer messages at `/chats` and an admin inbox at `/admin/chats`, with live replies while a conversation is open.
- Authenticated photo uploads to Netlify Blobs, with server-side validation and image optimisation.
- Custom Style enquiry preparation and My Closet enquiries that carry selected pieces into an editable chat draft, including through sign-in. Messages are sent only when the customer chooses Send.
- About, Our Story and delivery/order information pages, plus product photo galleries with uncropped imagery.

**Current scope:** Orders are discussed with the couturier; My Closet is not a checkout or order system. Automated payments, order tracking and customer review submission are not implemented. Chat supports text messages; attachments, email notifications, read receipts and typing indicators are not implemented. Password reset and email verification use Firebase's hosted email-action pages. See [admin setup and launch checks](docs/admin-setup.md).

## Stack

| Component | Responsibility |
|---|---|
| React 19, React Router and Vite | Storefront, customer accounts and admin interface |
| Plain CSS | Shared brand tokens and responsive layouts |
| Firebase Authentication | Customer and admin email/password authentication |
| Cloud Firestore | Products, content, admin memberships and saved pieces |
| Netlify hosting and Functions | Website delivery and authenticated image endpoint |
| Netlify Blobs and Sharp | Photo storage, validation and WebP conversion |

Firebase Storage and Firebase Cloud Functions are not required. New uploads do not use Cloudinary; the legacy URL helper remains for previously stored Cloudinary references.

## Local setup

Install a Node.js version supported by Vite 8, then run:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Fill `.env.local` with your Firebase web app configuration. Never commit this file.

1. Create the default Firestore database and enable Email/Password in Firebase Authentication.
2. Add the local and deployed website domains to Authentication's authorized domains as needed.
3. Publish this repository's `firestore.rules` to the intended Firebase project.
4. Follow [the admin setup guide](docs/admin-setup.md) to create the administrator and configure uploads.

For frontend development:

```powershell
npm run dev
```

For the frontend **and photo uploads through Netlify Functions**:

```powershell
npx netlify dev
```

Open `http://localhost:8888` for Netlify Dev. Local Blobs data is separate from production; local photos are not automatically migrated. Running Vite alone does not provide the image endpoint.

### Environment variables

| Variables | Where to set them |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | `.env.local` locally; Netlify build environment for deployment |
| `FIREBASE_WEB_API_KEY`, `FIREBASE_PROJECT_ID` | Netlify Functions environment; use the same Firebase project values |
| `VITE_CLOUDINARY_CLOUD_NAME` | Optional, only if old records contain Cloudinary public IDs |

Use [.env.example](.env.example) as the template. `VITE_` values are included in the public browser bundle: never put service-account credentials or private tokens there. Firebase permissions are enforced by authentication and Firestore rules.

Netlify supplies Blobs credentials to deployed functions. No Cloudinary upload preset, Firebase Admin secret or manually supplied Netlify token is required by the application. Local function configuration can fall back to the corresponding `VITE_FIREBASE_*` values.

Local environment values do not automatically reach Netlify. Configure both build and function variables there, then redeploy. If sign-in reports that Firebase is not connected, check the build variables and restart/rebuild after correcting them.

## Admin and content workflow

1. Create an account in Firebase Authentication and copy its UID.
2. In the Firebase Console, create `admins/{UID}` with the boolean field `active: true`.
3. Sign in at `/admin`. Public registration never grants admin membership; browser clients cannot create or change membership documents.
4. Add a product, upload photos and save a draft. Publish when ready or archive to hide it from customers.
5. Manage homepage banners, discovery sections and genuine reviews from the corresponding admin screens.

The categories and attributes screen is a spelling guide; renaming a label does not rewrite products. Storefront filters use published product attributes. Keep one active discovery section per placement (`home` or `shop`). Admin lists load 20 records at a time and search only loaded records.

Photo uploads accept JPEG, PNG and WebP up to 4 MiB. The server validates the image, removes metadata and converts it to WebP with a maximum dimension of 2400 pixels. Files live in the site-wide `catalogue-images` store and persist across deployments.

Photo URLs are public, including photos on draft products. Removing a photo from a record does not delete the file; failed record saves can also leave unattached photos. Clean up confirmed unused files in Netlify Blobs. Existing Cloudinary files are neither migrated nor deleted automatically.

## Possible running costs

**Checked 22 September 2026. Prices are in USD, before applicable tax and currency-conversion fees.** The actual Firebase and Netlify billing dashboards determine your account's plan and charges; this repository does not inspect or change them.

The site can run for **$0 per month** on Firebase Spark and Netlify Free while usage stays within both plans' limits. Free hosting is not a guarantee of unlimited traffic or uninterrupted service after a quota is exhausted.

### Firebase Spark

Email/password authentication is available without a paid Firebase plan. This app does not use SMS sign-in. Identity Platform upgrades have their own limits and pricing. See [Firebase pricing](https://firebase.google.com/pricing).

For one eligible standard Firestore database per project, the free allowances are:

| Resource | Free allowance |
|---|---:|
| Stored database data | 1 GiB |
| Document reads | 50,000 per day |
| Document writes | 20,000 per day |
| Document deletes | 20,000 per day |
| Outbound database data | 10 GiB per month |

Daily quotas reset around midnight Pacific time. Spark does not automatically charge paid overages: exhausted quotas can make requests fail until the relevant allowance resets, usage is reduced, or the owner upgrades. Storage limits do not reset daily. See [Firestore quotas](https://firebase.google.com/docs/firestore/quotas) and [Firebase plan behaviour](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

Photos are stored on Netlify, so their file sizes do not consume Firestore's 1 GiB database allowance. Product records, photo URLs, reviews and saved-piece data do.

The public catalogue currently fetches up to 1,000 published products and caches them within the page lifetime. A fresh visit or reload can read the catalogue again. For example, fetching 200 documents on each of 100 fresh visits is approximately 20,000 product reads, before homepage content, saved pieces and admin activity. A page view is not necessarily one database read. Membership checks in rules can also incur reads. See [Firestore billing](https://firebase.google.com/docs/firestore/pricing).

If you choose Firebase Blaze later, costs depend on database location and actual billable usage; there is no single fixed monthly price for this app.

### Netlify hosting, functions and photos

Current credit-based subscription options:

| Plan | Base price | Included monthly credits |
|---|---:|---:|
| Free | $0 | 300 |
| Personal | $9/month | 1,000 |
| Pro, entry tier | $20/month | 3,000 |

These allowances are shared across the team's projects. Accounts created before 4 September 2025 may retain legacy plans with different limits. Check your account before applying these figures. See [Netlify plans](https://www.netlify.com/pricing/).

Relevant credit meters:

| Activity | Credits used |
|---|---:|
| Successful production deployment | 15 per deploy |
| Bandwidth delivered | 20 per GB |
| Web requests | 2 per 10,000 requests |
| Compute, including image functions | 10 per GB-hour |

Uploading or publishing a product through the admin does not deploy the website. It uses database operations and, for photos, the upload function. Photo delivery consumes bandwidth and requests; uncached function work can consume compute. Do not treat Blobs as unlimited free image delivery. See [Blobs documentation](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

When available credits run out, Netlify pauses the team's projects. Free has a hard cap. Paid plans support extra credits; enabled auto recharge can add charges beyond the subscription. Review this setting before upgrading. See [credit rates and exhaustion behaviour](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/).

**Illustrative monthly usage, not a traffic guarantee:** four production deployments use 60 credits; 5 GB delivered uses 100; 50,000 requests use 10; 1 GB-hour of compute uses 10. Total: **180 credits**, within Free's 300 if there is no other team usage. Twenty production deployments alone consume 300 credits, leaving none for traffic.

For a sense of photo traffic, 1,000 visits downloading 20 photos averaging 250 KB each transfer about 5 GB, before scripts, styles and other assets. Actual transfers depend on browsing and caching; actual compressed photo sizes vary.

### Other possible expenses and keeping usage low

- A custom domain has registration and renewal costs set by the registrar. It is optional; budget renewal separately from hosting.
- New uploads do not require a Cloudinary subscription. Any existing Cloudinary account or legacy image delivery remains subject to that provider's plan.
- Payment-provider fees are not part of the current app because checkout is not implemented.
- Review Firebase usage and Netlify credits regularly, especially after publishing the catalogue or promoting the site.
- Use appropriately sized photos and remove confirmed unused uploads. Avoid repeatedly uploading the same image.
- Group code releases where practical. Admin content edits do not require a production deployment.
- If catalogue reads grow too quickly, add server-side pagination before the current 1,000-product fetch becomes a bottleneck.

## Build, deployment and verification

```powershell
npm run lint
npm run build
node --test tests/admin-model.test.mjs tests/image-storage.test.mjs tests/chat-model.test.mjs tests/product-model.test.mjs
```

`npm run preview` serves the built frontend locally; it does not replace Netlify Dev for function testing. The automated tests cover admin models and image handling, not a complete live Firebase/Netlify integration.

[netlify.toml](netlify.toml) configures `npm run build`, publishes `dist`, includes functions from `netlify/functions`, and provides the SPA route fallback. Configure environment variables before deployment and publish Firestore rules separately.

Before launch, test real customer registration/sign-in, denied admin access for customers, an authenticated photo upload, and a complete draft-to-published product flow. Check the storefront on mobile. Follow the full [launch checklist](docs/admin-setup.md#verification-before-launch); a passing build alone does not prove cloud configuration is complete.

### Chat setup and tests

Publish the updated `firestore.rules` before using chat on a deployed site. Customers must sign in; each customer owns one private conversation, and active admins can reply. Open threads subscribe to the latest 30 messages; earlier messages load on demand. The admin inbox loads 20 conversations per page and refreshes manually. Each sent message writes a message and its conversation summary, so chat adds Firestore reads and writes to the costs above.

The rules tests use a local Firestore emulator, not production data. With Java 21+ installed:

```powershell
npx firebase-tools emulators:exec --only firestore --project demo-udc-chat "node --test tests/chat-rules.test.mjs"
```

See [chat launch checks](docs/admin-setup.md#customer-and-admin-chat).

## Project structure

```text
src/
  components/       Shared UI, brand, navigation and domain components
  pages/            Public routes and admin screens
  firebase/         Firebase configuration, auth and Firestore helpers
  cloudinary/       Legacy image URL compatibility
  context/          Authentication, saved pieces and closet state
  hooks/            Shared React hooks
  services/         Public/admin data access and image upload client
  styles/           Design tokens and shared CSS
netlify/
  functions/        HTTP image upload and delivery endpoint
  lib/              Image validation, authentication and storage helpers
docs/               Setup and operational guidance
tests/              Admin model and image storage tests
firestore.rules     Database access rules
```

## Design system

Preserve the existing brand language and shared tokens in `src/styles/variables.css`.

| Colour | Value | Use |
|---|---|---|
| Wine | `#601013` | Primary actions, links and focus states |
| Gold | `#B08D57` | Decorative accents, not body text |
| Ivory | `#FBF8F2` | Main background |
| White | `#FFFFFF` | Surfaces and inputs |
| Ink | `#1F1F1F` | Primary text |
| Gray | `#6B6B6B` | Secondary text |

Use Cormorant Garamond for editorial headings and Inter for body text, navigation and forms. Render official artwork through `src/components/brand/Logo.jsx`; do not recreate the logo with text. Artwork configuration lives in `logoAsset.js`, and approved core copy in `brandLanguage.js`.

Shared styles cover typography, layouts, forms, surfaces and responsive behaviour. Preserve visible labels, keyboard focus, comfortable touch targets and reduced-motion support when adding screens.
