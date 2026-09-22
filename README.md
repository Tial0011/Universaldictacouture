# Universal Dicta Couture

Universal Dicta Couture website. This repository contains the
foundation for the site — Sections 1–4 of the product
specification only. Later-phase features (full homepage content,
shop/checkout logic, admin dashboard functionality, etc.) are
intentionally not implemented yet; the structure below exists so they
can be added cleanly.

## Stack

- React 19 + Vite
- React Router
- Plain CSS (design tokens in `src/styles/variables.css`)
- Firebase (Auth + Firestore)
- Netlify Blobs (image storage — not Firebase Storage)
- Netlify (hosting + optional serverless functions)

## Getting started

```bash
npm install
cp .env.example .env   # fill in real Firebase values
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
  assets/brand/     Official logo artwork (original + web derivative)
  components/
    brand/         Logo component, logo asset config, approved brand language
    common/        Shared UI primitives (Button, LoadingSpinner, etc.)
    navigation/     Header, Footer, layout wrappers, admin layout
    products/ homepage/ shop/ reviews/ closet/ savedPieces/ chat/
                    Domain-specific components, added as each area is built
  pages/            One folder per route (public site + admin/)
  firebase/         Firebase app/auth/firestore setup
  cloudinary/       Legacy Cloudinary URL compatibility
  hooks/            Shared React hooks
  context/          React context providers (auth, etc.)
  services/         Data-access layer (Firestore/image storage calls), added per domain
  utils/            Generic helpers
  styles/           Design tokens, global reset, responsive helpers
netlify/
  functions/        Netlify Functions — empty until server-side logic is needed
```

## Design system (Section 1)

All styling flows from CSS custom properties in
`src/styles/variables.css`. Component CSS uses tokens only — no
hard-coded colours, fonts or one-off spacing.

```
src/styles/
  variables.css   tokens: colour, type scale, spacing, radii, shadows, motion, logo sizes
  base.css        reset, typography, links, focus states, reduced motion
  layout.css      container, section, stack, skip link, visually-hidden, gold accent rule
  forms.css       form-control foundations (.field, .form-control, .choice)
  surfaces.css    surface/card foundations (.surface, --raised, --brand, --padded)
  responsive.css  breakpoint reference + responsive token overrides
  global.css      entry point that imports the above in order
```

### Brand colours (locked)

| Token | Value | Use |
|---|---|---|
| `--color-wine` | `#601013` | Primary brand colour: buttons, links, focus ring, active states |
| `--color-gold` | `#B08D57` | Restrained accent — **decorative only** (rules, underlines). Never text: it is 2.9:1 on ivory |
| `--color-ivory` | `#FBF8F2` | Main page background |
| `--color-white` | `#FFFFFF` | Surfaces, inputs |
| `--color-ink` | `#1F1F1F` | Primary text |
| `--color-gray` | `#6B6B6B` | Secondary text (5.0:1 on ivory) |

`--color-brand-hover`, `--color-brand-tint` and the border tokens are
derived states of these colours, not new brand colours.

### Typography

**Cormorant Garamond** (display/editorial headings) and **Inter**
(body, navigation, buttons, labels, forms), both open-source, loaded
from Google Fonts via `<link>` in `index.html` (preconnect +
`display=swap`, only the weights in use). The official logo lettering is
never recreated with either font.

### Logo

The logo is rendered from artwork only, through one component:
`src/components/brand/Logo.jsx`. The artwork and its dimensions are set
in `src/components/brand/logoAsset.js`. To replace the logo, drop the new
file into `src/assets/brand/`, update the import and the `width`/`height`
in `logoAsset.js`. Sizing tokens (`--logo-height-header`,
`--logo-height-footer`, `--logo-min-height`) are in `variables.css`.

`src/assets/brand/logo-original.jpeg` is the supplied source image
(kept untouched). `logo.png` is a cropped, transparent-background,
web-sized derivative of it.

### Approved brand language

`src/components/brand/brandLanguage.js` holds the three approved core
lines (tagline, declaration, supporting line). Import from there;
do not retype or add alternatives. The full manifesto belongs to the
future About/editorial experience.

### Accessibility conventions

- One focus ring (wine, 2px, 3px offset) via `:focus-visible`.
- Interactive targets are at least `--touch-target` (44px; 48px on touch devices).
- Every form control has a visible `<label>`; see the pattern at the top of `forms.css`.
- Use `<Button to="/path">` for navigation (renders a link) — never a `<button>` inside an `<a>`.
- Motion is disabled under `prefers-reduced-motion`.

## Environment variables

See `.env.example` for the full list (Firebase config + Netlify Functions
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

## Admin workspace
The admin at `/admin` now includes protected access, product management, a catalogue label guide, homepage banners, discovery tiles and reviews. See [Admin setup](docs/admin-setup.md) for Firebase Spark access rules, Netlify image storage configuration and launch verification. This supersedes the earlier admin-placeholder note above.
