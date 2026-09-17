# services/

Data-access functions live here, one file per domain (e.g.
`products.js`, `reviews.js`, `closet.js`), each wrapping Firestore
queries/mutations from `src/firebase/firestore.js` and, where images
are involved, `src/cloudinary/cloudinary.js`.

Nothing is added here yet — the specification is locked through
Section 4 and later-phase data models (products, reviews, etc.)
haven't been defined. Components should not call Firestore directly;
route data access through this layer once a domain's shape is
specified, so later phases can add features without touching
component code.
