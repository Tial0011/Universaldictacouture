# services/

Data-access functions live here, one file per domain. Components never
call Firestore directly — everything goes through this layer, and every
product read passes through `productModel.js`, so an incomplete or
unpublished document can never reach the public UI.

| File | Responsibility |
| --- | --- |
| `productModel.js` | Normalises product documents, publishing-completeness rules, pricing, required options, Closet line keys |
| `products.js` | Published catalogue reads, New In selection, authoritative revalidation before a Closet line is created |
| `content.js` | Hero slides, discovery modules, published review/feed entries |
| `styleCircle.js` | Style Circle subscriptions (write-only) |

## Collections

### `products`
Only documents with `status: "published"` are ever returned, and a
document is dropped unless it has a name, a stable slug/ID, a valid
price (or priced variants), a primary image and a category.

```jsonc
{
  "name": "Ivory Aso Oke Wrapper",
  "slug": "ivory-aso-oke-wrapper",     // stable; used in /shop/:slug
  "status": "published",               // "draft" | "published"
  "archived": false,
  "price": 85000,                      // NGN. Omit when using variants
  "variants": [                        // lowest price drives "From ₦…"
    { "id": "s", "price": 120000, "options": { "Size": "S" } }
  ],
  "options": [                         // required options must be
    { "name": "Size", "values": ["S", "L"], "required": true }
  ],                                   // resolved before Add to Closet
  "unitLabel": "",                     // optional, e.g. "per set"
  "primaryImage": { "publicId": "udc/wrapper", "alt": "" },
  "images": [{ "publicId": "udc/wrapper-2" }],
  "category": ["Ready-to-Wear"],
  "occasion": ["Bridal"],
  "style": ["Classic"],
  "fabric": ["Sanyan"],
  "colour": ["Ivory"],
  "size": ["M"],
  "isNewIn": true,                     // merchandising state, not sort
  "publishedAt": "<timestamp>",        // FIRST published — drives Newest First
  "aliases": ["iro"],                  // admin-managed search aliases
  "keywords": ["wedding"]              // admin-managed search keywords
}
```

`publishedAt` must be set once, when the product is first published,
and never touched on later edits — Newest First means first-published.

### `heroSlides`
`{ published, concept, order, image, imageMobile, eyebrow?, headline?, secondary?, body? }`.
`concept` must be one of the five approved values (see `content.js`);
anything else is ignored. Copy fields fall back to the approved hero copy.

### `discoveryModules`
`{ placement: "home" | "shop", active, title, order, groups: [{ id, label, order }],
items: [{ id, name, image, destination, group, order, published }] }`.
Items without a name or an internal destination are hidden.

### `reviews`
`{ published, body, author?, image? }`. Nothing is rated, counted or
marked verified.

### `styleCircleSubscribers`
Created by the public site, keyed by a hash of the address. Rules must
permit `create` and deny `read`/`list`/`update`, which is also how a
duplicate signup is detected.

### `savedPieces/{uid}`
`{ productIds: [] }`, readable and writable only by that user. Guests
keep Saved Pieces in `sessionStorage` for the current session only.
