# Website completion review — 23 September 2026

## Completed in this pass

- Compact floating mobile menu with a centered existing logo, the international-facing “Modern fashion. A heritage you wear.” line, a decorative clasp dismissal control, and a continuous woven pattern. Keyboard focus, Escape, backdrop dismissal, and scroll locking are retained.
- Completed About, Our Story, ordering information, and Custom Style pages using the existing brand and known ordering process. No founding history, delivery guarantees, or return deadlines were invented.
- Custom Style enquiries and My Closet selections become editable chat drafts. Guest enquiries retain their return destination through sign-in/sign-up; sending remains an explicit customer action.
- Account password-reset and email-verification controls using Firebase's hosted email actions.
- Product details with all uploaded photos accessible through a gallery, proportional uncropped images, required options, price feedback, and saved/closet actions. Optional selections now survive closet preparation and variant-price resolution.
- Uncropped category and closet imagery, consistent route metadata, route scroll/focus handling, and recovery UI for a page that fails to load.
- Page code loads on demand, including admin screens. Shared image styles load with the image component itself.
- Corrected ambiguous newsletter failure feedback and outdated photo-storage setup instructions. Removed the stray text after the HTML document.

The existing homepage content, benefits, category groups, routes, and design tokens remain in use. No framework or carousel dependency was added.

## Validation

- Production build passes.
- Lint exits successfully with the existing React warnings; no new lint errors.
- 16 model/storage tests pass, including image authorization/validation, content publication, chat message limits, enquiry drafts, and product selections.
- Homepage checked at 320, 390, 640, 768, 1024, 1440, and 1920 pixels: no horizontal page overflow; all five benefits present; utility bar hidden below the existing mobile breakpoint.
- Mobile menu fits the viewport, keeps the hero stationary, supports keyboard dismissal, and allows access to the final navigation items on a short screen.
- Actual Shop By component checked with a local nine-card fixture in each group: horizontal card scrolling preserves the active group; arrows follow the three-group sequence without looping; changing groups resets card scrolling.
- Product component checked with isolated local catalogue data at 320, 390, 768, and 1440 pixels: full image aspect ratios, gallery selection, option pricing, saved state, and closet destination all pass.
- Custom Style and closet draft preparation, password-reset form state, and the transition from private-page metadata back to the homepage pass.

Fixture data was only used by the local browser checks and is not part of the storefront catalogue. These checks do not substitute for live Firebase/Netlify integration tests.

## Still required for a verified live launch

The local workspace has no configured Firebase environment. A live URL and confirmation of the connected Firebase and Netlify projects are needed to verify the deployed site.

1. Confirm build/function environment configuration, Firebase authorized domains, published database rules, and active administrator membership.
2. Verify real registration, password reset, verification email delivery, saved pieces, customer/admin chat, and denied access for non-admins.
3. Upload a real draft photo through Netlify, publish its product, and confirm the storefront reads it correctly.
4. Supply/publish genuine catalogue content, testimonials, and the brand's social URLs where missing.
5. Confirm the brand's actual order-specific terms with the owner. The site supports the existing couturier-guided bank-transfer process; automated checkout, order tracking, automated marketing emails, and customer review submission are not implemented.

See [admin setup and launch checks](admin-setup.md) for the concrete setup steps. No production connection or email delivery is claimed as verified in this review.
