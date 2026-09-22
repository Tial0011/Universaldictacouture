# Netlify Functions

images.js handles POST uploads and GET/HEAD image delivery at /.netlify/functions/images.

- Auth: verify the Firebase ID token through accounts:lookup, then require admins/{uid}.active using Firestore rules.
- Input: JPEG, PNG or WebP up to 4 MB, decoded and re-encoded with sharp. SVG and animated images are rejected.
- Storage: site-wide catalogue-images Netlify Blobs store; new UUID per upload.
- Delivery: public WebP URL, with caching and nosniff headers. Draft image files are also public.
- Secrets: none beyond credentials Netlify supplies for Blobs. FIREBASE_WEB_API_KEY and FIREBASE_PROJECT_ID must be available to Functions (the VITE_* equivalents are accepted as a fallback).
- Local development: npx netlify dev, then use port 8888. Vite alone does not run functions.

See ../../docs/admin-setup.md for full setup and deployment checks.