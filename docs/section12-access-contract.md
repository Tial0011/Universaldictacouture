# Section 12 staff access and implementation boundary

The current implementation retains Firebase Authentication, Firestore, the existing `admins/{providerUid}` binding path and Netlify infrastructure. It adds an explicit durable `staffId` and independently complete capability/purpose/scope routes. This is the Section 16 implementation translation of the Section 12 requirements, not a second staff or business-domain database.

## Current access shape

Owner-authorized development exception (2026-10-07): existing active legacy `admins/{uid}` memberships lacking **both** canonical fields use the centralized `legacy-development-admin` adapter and matching Firestore bridge. See [the compatibility contract and rollout](admin-development-compatibility.md). No role string creates access, no membership is persisted by the adapter, and canonical/partially migrated records do not acquire fallback grants. The strict canonical contract below remains the final architecture, not a prerequisite that locks legitimate unmigrated development admins out during this bridge period.

Final current evidence is `section12-final-implementation-verdict.md`, `section12-final-coverage.json`, `section12-final-integration-audit.json` and `section12-part4-coverage.json`: 20 modules/501 official dispositions with implementation lock withheld. Prior 321-flow accounting is historical; current product architecture is locked but missing positive owner/security/history behavior is not code PASS.

`active` means current Staff Access. It does not grant business permission. `staffId` is the durable UDC human attribution identity; a provider UID is its login binding. A role/title, assignment, Function as Couturier, eligibility or availability does not independently authorize an action.

An illustrative read-only reviewed grant, using synthetic identifiers:

```json
{
  "staffId": "staff-example-human",
  "active": true,
  "capabilities": {
    "products.read": {
      "selectedObject": {
        "active": true,
        "purpose": "catalogue",
        "ids": ["example-product"]
      }
    }
  }
}
```

This is not a default grant or a migration script. Real grants require the governance owner's review. Never infer grants from existing Admin/Super Admin role labels. One real human must retain one durable staff identity when functioning as a Couturier.

## Capabilities currently enforced

| Capability | Purpose | Boundary |
| --- | --- | --- |
| products.read | catalogue | Product discovery/exact access in scope |
| products.create | catalogue | New private Draft identity; does not grant existing-record editing |
| products.edit | catalogue | Descriptive fields only; does not grant commercial/media/discovery/lifecycle authority |
| products.commercial | catalogue | Price/unit/variant/service-mode fields in scope |
| products.media | catalogue | Product media assignment in scope; not customer-private media rights |
| products.discovery | catalogue | Product classification/merchandising assignment; not global taxonomy administration |
| products.publish | catalogue | Reserved for the protected owner Publish/Update Live pipeline; legacy publication is currently blocked |
| products.archive | catalogue | Required for archived target state |
| products.unpublish | catalogue | Published → Unpublished |
| products.restore | catalogue | Archived → Unpublished; never republish or restore to Draft |
| content.read | content | Existing content workspace visibility |
| content.edit | content | Existing content owner writes |
| content.delete | content | Existing permitted content deletion/reset |
| reviews.read | moderation | Read-only Review operational state |
| chats.read | customer-service | Current General Chat read in legitimate resource scope |
| chats.reply | customer-service | Separate current reply authorization |
| media.upload | public-media | Netlify public catalogue/content upload only |
| audit.read | audit | Read-only formal action evidence |
| operations.reconcile | operation-result | Exact own-operation receipt check; does not authorize Audit listing or another actor's receipt |

Six scope families remain represented: domainWide, assignmentDerived, selectedObject, queueSubset, dataPurpose and governance. Currently backed Firestore retrieval paths support independently complete domain-wide/selected-object routes, plus assignment-derived General Chat. Queue/data-purpose/governance retrieval and mutation mechanisms remain closed until their owner contracts are implemented. Unsupported scope families never fall back to broader access. Routes cannot splice an active flag from one route with purpose or IDs from another.

The current UI can expose an authorized source-unavailable surface for customers, orders, payments and customStyle read grants. Those grants do not cause new collections or owner mutations to be created.

## Trusted enforcement and privacy

Firestore independently enforces current identity/access, exact capability, purpose and supported resource scope. The Netlify image function verifies the Firebase principal and current explicit public-media capability. UI filtering is presentation only. Query plans constrain scope before retrieval; operational REST queries additionally select only the fields needed for summaries. Chat and Review summary responses omit message/review bodies, contact details and private media.

The existing owner records do not yet implement all fine-grained field/media-purpose separation required by Section 16. Summary field selection does not replace that owner data-model obligation. Private media must not be uploaded to the existing public image endpoint.

Product writes use transactions, current membership checks, a monotonically increasing `_version`, authoritative first-publication chronology and an immutable `staffAudit` receipt. The receipt contains human actor, target, execution, outcome and time, not copied business payload. Product writes without the required atomic receipt are denied. Audit is distinct from Recent Activity and transaction history. An actor's exact receipt check requires current Staff Access and an explicit operations.reconcile route, or independently valid Audit read authority; listing Audit requires its independent capability.

Current operation-result authority is required before a save/reply begins. New staff Chat replies atomically append private Audit evidence with both principal UID and durable staff ID. Customers can read their own messages but cannot read this staff governance evidence. Existing historical messages are retained without inventing retrospective attribution. General Chat Inbox now consumes the minimal operational REST summary, and exact transcript access remains separate from broad previews.

Published Product edits and new Publish/Update Live are blocked until the owner supplies private Working/Live revisions, complete current readiness, media/consent and revision-pinned publication. The four lifecycle states are preserved. Unpublish, Archive and Restore use explicit actions with current capability, owner state, version and atomic Audit. Ordinary saves cannot invent first-publication or creation evidence. Unknown Product fields cannot be introduced through the retained editor.

Unknown Product save/message outcomes remain unresolved until authoritative evidence establishes commitment. Absence of a receipt alone is not proof that retry is safe. Product and logical General Chat operation IDs are retained in actor-bound browser session storage and survive reopening/reloading that session. Chat markers additionally bind the exact conversation; reconciliation verifies immutable receipt actor, target, action and committed outcome. They contain no business/message payload and are not authority. Cross-device/new-browser-session operation recovery remains an owner requirement; only a known original rejection plus authoritative absence can establish safe noncommitment here.

Part-2 Search adds actor/access-bound memory-only query handoff (history receives an opaque handle), minimal grouped loaded-page results, scoped source errors and at most five session-isolated recent entity handles. Each recent preview and exact open rechecks current owner authorization; Search never creates permission. Unbacked domains appear only when independently discoverable and remain source-unavailable rather than empty. Current human-readable reference resolvers and complete cross-domain indexes are still owner dependencies.

Part-3 adds derived checked-page operational metrics and meaningful Product lifecycle activity. Publication state is distinct from catalogue issue readiness. The shared exact-open capsule/resolver carries no authority or private payload and reconciles current issue state. Recent Activity requires independent existing `audit.read` evidence scope and `products.read` target scope; trusted queries constrain immutable actor (My view), target collection/IDs, eligible action and confirmed outcome before return. Team view requires complete broad grants for both evidence and Product domain. The feed is a limited awareness projection, not formal Audit: receipts remain immutable, ordinary saves/Chat messages are excluded, and unsupported Customer/System/transaction events are not fabricated. Local index definitions are staged in `firestore.indexes.json`; no cloud index, rule, grant or deployment was changed.

## Closed superseded paths and external owner work

Unrestricted Product hard deletion and physical media purge are blocked pending current historical-reference/retention eligibility. Legacy Review creation/edit/publication/deletion is blocked pending consent, version and eligibility enforcement. The old Review editor is not routed. No legacy quality-rating values are automatically converted to service ratings.

The receipt-only recovery mechanism cannot always establish noncommitment for a narrowly scoped actor when no receipt exists or current read authority was revoked. Those cases remain unresolved and block retry; a durable owner operation/rejection registry is an outstanding Section 16 dependency. No absence-of-receipt assumption is presented as success or failure.

Protected governance provisioning must still implement unique-human binding, maximum-two active Super Admin safeguards, grants/revocations, offboarding and required fresh-security-proof. Browsers cannot write memberships. This implementation does not present a role label or manually edited boolean as those completed governance guarantees.

Customer operational projections/lifecycle, Order/Edition/Extension, Payment ledger/proof review, dedicated Main Order Chats, structured Custom Style, complete search/indexes, event-based Recent Activity and delegated claim/assignment endpoints remain owner dependencies. See `section12-part2-coverage.json` for the newest 115-flow Modules 6–10 inventory; the inherited 321-flow register remains historical evidence for the other modules, not Part-2 completion authority.

## Coordinated rollout

Final runtime bounds read/write waiting without cancelling possible late owner commits. Product/Chat happy-path and recovery explicitly validate committed actor/operation/target/action evidence. Local pending handles cannot be overwritten and cannot authorize business work; full durable cross-device/terminal rejection registry remains external. BFCache/visibility/offline handoff invalidates cached authority before server recheck. Framing denial and staged private-document headers are defense-in-depth, not trusted permission.

Final context/state/status/confirmation and owner table/navigation transforms carry only bounded safe context, preserve independent current owner enforcement and never assign/reveal private media/fabricate priority. Source errors cannot become zero or fake healthy work. Required complete governance/MFA/fresh proof/unique-human/max-two, six trusted scope mechanisms, private field/media/relationship/consent, missing owner sources/history/audit/abuse controls remain explicit critical/high dependencies.

No production rules, memberships, backend data or deployment were changed. Before any separately authorized rollout, review real principal-to-staff bindings and grants, resolve the required owner dependencies, and coordinate frontend/function/rules release. There is deliberately no automatic active-membership-to-all-capabilities conversion.

Existing public catalogue/media delivery is preserved. No private service-account key or token is required by the new read projections, and none is placed in client configuration.
