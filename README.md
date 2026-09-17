# Universal Dicta Couture

Contemporary fashion, rooted in Aso Oke heritage. This repository
contains the foundation for the site — Sections 1–4 of the product
specification only. Later-phase features (full homepage content,
shop/checkout logic, admin dashboard functionality, etc.) are
intentionally not implemented yet; the structure below exists so they
can be added cleanly.

## Stack

- React 19 + Vite
- React Router
- Plain CSS (design tokens in `src/styles/variables.css`)
- Firebase (Auth + Firestore)
- Cloudinary (image storage — not Firebase Storage)
- Netlify (hosting + optional serverless functions)

## Getting started

```bash
npm install
cp .env.example .env   # fill in real Firebase/Cloudinary values
npm run dev
```

## Building for production

```bash
npm run build
npm run preview   # optional, serves the production build locally
```

## Project structure

```
src/
  components/
    common/        Shared UI primitives (Button, LoadingSpinner, etc.)
    navigation/     Header, Footer, layout wrappers, admin layout
    products/ homepage/ shop/ reviews/ closet/ savedPieces/ chat/
                    Domain-specific components, added as each area is built
  pages/            One folder per route (public site + admin/)
  firebase/         Firebase app/auth/firestore setup
  cloudinary/       Cloudinary upload + URL helpers
  hooks/            Shared React hooks
  context/          React context providers (auth, etc.)
  services/         Data-access layer (Firestore/Cloudinary calls), added per domain
  utils/            Generic helpers
  styles/           Design tokens, global reset, responsive helpers
netlify/
  functions/        Netlify Functions — empty until server-side logic is needed
```

## Design system

Brand tokens are locked and defined as CSS custom properties in
`src/styles/variables.css`:

| Token | Value | Use |
|---|---|---|
| `--color-wine` | `#601013` | Primary brand color |
| `--color-gold` | `#B08D57` | Luxury accent |
| `--color-ivory` | `#FBF8F2` | Main background |
| `--color-white` | `#FFFFFF` | Surfaces |
| `--color-ink` | `#1F1F1F` | Primary text |
| `--color-gray` | `#6B6B6B` | Secondary text |

Typography: **Cormorant Garamond** for editorial/display headings,
**Inter** for body text, navigation, forms, and UI labels.

The header currently renders `public/logo-placeholder.svg`, a
temporary placeholder mark. Replace it with the official logo artwork
file before launch — the logo should never be recreated as styled
text.

## Environment variables

See `.env.example` for the full list (Firebase config + Cloudinary
cloud name/upload preset). All client-side variables are prefixed
`VITE_` per Vite's convention.

## Notes for later phases

- Data-access code belongs in `src/services/`, one file per domain,
  built on top of `src/firebase/firestore.js`. Components should not
  call Firestore directly.
- Add a Netlify Function only when logic genuinely requires a server
  (a secret, a signed request, a webhook) — see
  `netlify/functions/README.md`.
- No fake products, reviews, statistics, or testimonials are included
  anywhere in this codebase.
