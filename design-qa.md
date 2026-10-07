# Section 12 visual-reference conformance QA

final result: blocked

Remaining P1 source-fidelity issue: A01's desktop atelier photograph is not implemented; the supplied board is composited with prohibited/generated text, monogram and form, and no clean standalone photo was found in the scoped Section 12 archive or current repo assets. The current burgundy brand panel is a safe implementation around that asset dependency, **not a silently approved replacement**. Supply the approved background asset, authorize background-only derivation from A01, or explicitly accept the existing non-photographic treatment before visual PASS. This is a visual QA gate, not a Section 12 functional implementation lock.

## Source / normalization

Source: `C:/Users/HP ENVY/Videos/1A1 IMPORTANT UDC PICTURES/✅ SECTION 12/SECTION 12 VISUAL .docx`; 395 paragraphs read, all six embedded images opened. SHA256 `E3801FB0384C695C5A4DE224E7E2990F2F2ABB782473A0F3CFFF31D8ECDAC226`.

Actual DOCX relationships: A01 rId10/image1.png, A02 rId11/image2.png, A03 rId12/image3.png, A04 rId13/image4.png, A05 rId14/image5.png, B01 rId15/image6.jpg. Extracted without modifying the document under `.tools.local/section12-final-visual-reference/`. Earlier/historical sources were not used as authority. The missing Flow-4 board was not fabricated.

These are presentation boards, not browser screenshots with known CSS viewport/density. A01 source is 1536×1024; A02 1536×1024; A03 1800×1544; A04 1800×889; A05 1800×1247; B01 1536×1525. Source board labels/device chrome are excluded by focused crops. Exact physical pixel equality is not asserted. Compare current entry, desktop shell, compact/mobile transformation, inactive access, denied destination and official artwork in their corresponding states. Generated Collections content, actors/counts/monogram are not the current application or new product requirements. A01's photographic composition remains relevant visual intent and is the explicitly unresolved asset difference above.

Browser CSS widths: 320,390,768,900,1024,1280,1440,1920; normal density 1; height 900. Additional sign-in density 2 capture is 2880×1800 for CSS 1440×900. Main captures have their matching width×900 physical pixels. `tests/section12-visual-compare.mjs` creates combined source-left / implementation-right images at 1516×900, each side aspect-contained in 750×900. No comparison derivative is used as a website asset.

Full-view evidence: `.tools.local/section12-visual-comparisons/A01-desktop.png`, `A01-mobile.png`, `A02-shell.png`, `A03-responsive.png`, `A04-access.png`, `A05-denied.png`, `A05-state-family.png`, `B01-logo.png`. Opened together with live rendered captures. Focused actual overlays/cards/menu: `.tools.local/section12-part4-context-1440.png`, `.tools.local/section12-part4-products-390.png`, `.tools.local/section12-visual-navigation-sheet-390.png`. Raw entry/access/state captures use `section12-visual-*` filenames.

## Comparison history / findings

1. Before implementation: P1 plain sign-in card lacked desktop panel relationship/mobile branded entry; P2 text-only navigation and absent mobile brand anchor; P2 oversized general headings/loose workspace rhythm; P2 common notices lacked consistent icon/title/tone hierarchy. Implemented shared scoped visual overlay, existing official artwork, upstream icons and presentation-only state mapping.
2. First rendered revision: P1 mobile brand band shrank to intrinsic content; desktop grid regions did not fill their tracks. Fixed `justify-items: stretch`, explicit mobile 132px first row, and separately centered embedded-entry refusal. Added runtime assertion for full-width mobile band.
3. Second comparison: P2 repeating textile edge risked competing with long navigation labels; moved existing motif to footer below navigation. P2 inactive access used an inline generic restricted notice; centered state composition and distinguished server-confirmed inactive vs unresolved actor context vs source/network inability to verify. No extra permission or inferred support actor.
4. Font-grounded revision: mirrored the actual index's approved Cormorant Garamond/Inter links in QA HTML, verified loaded subsets, and restrained stronger display-heading weight. Kept system fallback discipline and 200% text reflow. Post-fix combined source/render inputs regenerated and opened, including focused 2× entry and actor-unresolved mobile capture. Earlier spacing/state issues are fixed. Remaining P1 photographic asset difference remains blocked, rather than relabelled as an intentional approved deviation.

## Required fidelity surfaces

- Fonts: existing Cormorant Garamond display, Inter operational text; no new family/global token changes. 32px-class entry display, restrained responsive workspace headings, readable 14–16px operational copy, labelled native controls. Loaded Latin subsets checked; unused unicode subsets legitimately remain unloaded.
- Spacing/layout: 248px wide sidebar; inherited 88px compact rail at 900–1399; leading native navigation sheet below 900; compact branded topbar; deliberate 440px maximum entry form; rounded-but-controlled panels, modest elevation, wrapping rows/actions. State overlays use usable viewport capacity, not the board's decorative device chrome.
- Colors: existing wine/deep-wine/ivory/near-black/muted-gray aliases. Metallic tone is decorative only. Normal text/primary controls/inverse text/focus contrast checked by tests; no low-contrast gold body text.
- Assets: existing official 480×244 alpha logo/white variant; source official script shape verified. Never redraw generated UDC monogram. Existing approved project textile SVG used minimally, not handcrafted replacement art. 23 upstream Feather SVGs (approximately 8.1KB total) plus MIT licence; no icon runtime dependency. No raster sign-in board/photo with forbidden slogans, no fake product images/avatars, no generated replacement canonical board.
- Copy: preserve real operational source/partial/unknown/restricted distinctions. Exclude remember-me, geography, slogans, fake KPI values, assumed support actor and generated fallback destinations. Do not rasterize text or label unavailable owner systems as implemented.

## Interactions / accessibility / regressions

Real emulator authentication and safe rejected-sign-in response; password reveal/hide name+pressed state, native labels and associated errors; 44px control; navigation focus trap/Escape/opener return; drawer/confirmation Cancel and owner receipt; responsive owner table semantics; keyboard search; current-state/stale/resolved-elsewhere flows; scoped summary network privacy; mid-session revocation/account change/assignment loss; offline/online/BFCache withdrawal; no blind unknown writes; 23 actual state-component presentations and reduced-motion animation removal. No page/card overflow at all eight widths; 200% entry and operational text; 2× entry capture. Screen-reader semantics/AX inspected, not a formal WCAG certification or exhaustive assistive-device audit.

## Intentional deviations / limits

- Written current navigation overrides the board's generated Collections/modules and persistent mobile bottom bar. Missing Flow-4 image remains archive-only gap.
- Official B01 artwork supersedes incidental UDC monogram. Current text/palette tokens supersede incidental generated fonts/labels.
- Rich sign-in photograph only exists inside a composited board containing prohibited copy/branding. Do not turn that screenshot into a giant background or silently invent matching scenery. Its burgundy-brand/ivory-form panel relationship is implemented with efficient existing approved assets, but full photographic fidelity remains P1 pending clean asset/explicit Owner direction.
- Only currently backed owner workflows can be runtime-tested. Unbacked Customer/Order/Payment/Custom Style/private-media/moderation/other owners remain explicit unavailable boundaries; previous whole-section PARTIAL verdict is unchanged.

## Implementation checklist

All six refs mapped; A02/A03/A04/A05/B01 validated with written overrides; A01 entry/form/access semantics implemented and tested but photographic fidelity partial. Missing Flow-4 board handled using written navigation. 240 tests passed; lint/build/whitespace passed; eight-width final browser run passed, zero runtime exceptions. Existing authorization/backend preserved; no production writes/deployment/commit. Continue only from the A01 asset decision, not a Section 12 restart.

## Follow-up polish

A vector official brand master would improve optional future raster sharpness beyond checked sizes. It is not needed for current logo acceptance. The A01 photo requirement above is not mere follow-up polish.
