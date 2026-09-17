# netlify/functions/

No functions exist yet — none are needed for Sections 1–4 of the
specification. Add a function here only when server-side logic is
genuinely required (a signed Cloudinary operation, a payment
webhook, anything that needs a secret the client must never see).

Each function is a single file exporting a handler, e.g.:

```js
// netlify/functions/example.js
export async function handler(event) {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true }),
  };
}
```

It becomes available at `/.netlify/functions/example` in production
and via `netlify dev` locally.
