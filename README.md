# Universal Dicta Couture

React storefront and staff workspace for Universal Dicta Couture.

## Project overview

Customers browse the public catalogue, save pieces, manage their account and contact the brand. Staff use a protected `/admin` workspace with scoped permissions. Product and editorial images are uploaded through Netlify Functions, validated and stored in Netlify Blobs. Firebase Authentication owns sign-in; Cloud Firestore stores catalogue, content and account-related data.

### Platform responsibilities

| Platform | Used for |
| --- | --- |
| Netlify | Website hosting, serverless Functions and image delivery/storage through Netlify Blobs |
| Firebase Authentication | Customer and staff identity sign-in |
| Cloud Firestore | Catalogue, content and app records, protected by `firestore.rules` |
| React, React Router, Vite | Website interface, routes and production build |

Cloudinary is not used. New and existing image references should be direct URLs returned by the Netlify image service or local bundled assets.

## Run locally

Requirements: Node.js 22 or newer (Netlify builds use Node 24), npm, and the configured Firebase/Netlify environment values.

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill the required values in .env.local
npx netlify dev
```

Open `http://localhost:8888`. Netlify Dev is needed for image and account Functions; `npm run dev` runs only the Vite frontend.

Useful commands:

```powershell
npm run lint
npm run build
npm run test:accounts
```

The account suite needs Firebase Auth and Firestore emulators on ports 9099 and 8089. Production configuration and deployment are not performed by these commands.

## Setup and operations

- Copy `.env.example` to `.env.local` and fill in Firebase web configuration and the local Function settings. Never commit `.env.local` or expose server secrets with a `VITE_` prefix.
- Configure matching Firebase and Function secrets in Netlify. Netlify Blobs credentials are supplied by Netlify.
- Enable Firebase Email/Password Auth and authorized website domains.
- Review and publish `firestore.rules` to the intended Firebase project only after the rules emulator suite passes.
- Follow [docs/admin-setup.md](docs/admin-setup.md) for staff access, image workflow and launch checks.
- Use [TODO.md](TODO.md) to track remaining setup, verification and owner-dependent work.

## Scope

This is a catalogue and enquiry website, not an online checkout. Automated payments, order tracking and customer review submission are not represented as available features. See the setup guide and TODO list for pending integration work.

## Folder map

```text
src/                 React app, screens, shared components, services and styles
src/assets/          Bundled brand and editorial images
src/firebase/        Firebase app, Auth and Firestore setup
src/services/        Account, catalogue, admin and image-storage client logic
netlify/functions/   Netlify HTTP Functions
netlify/lib/          Function handlers and server-side domain services
docs/                 Setup guides, contracts and implementation reports
tests/                Model, service, rules and browser checks
scripts/              Build validation and maintenance utilities
firestore.rules       Firestore authorization rules
netlify.toml          Netlify build, Functions and SPA routing configuration
vite.config.js        Vite development configuration
package.json          Scripts and dependency manifest
.env.example          Safe environment-variable template
TODO.md               Remaining project work
```

Keep feature code near its owning area, shared behavior in `src/services` or `src/hooks`, operational notes in `docs`, and tests alongside the established `tests/` suite. Do not move files just for visual grouping when that would break imports or documented workflows.
