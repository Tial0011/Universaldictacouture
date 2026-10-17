# Account continuity — mandatory regression boundary

UDC already has Customer and Staff identity owners. Future features must reuse them.

- Preserve existing Firebase principals and durable Account/Staff bindings. Do not replace users or infer account ownership from matching email alone.
- Use the existing account API/session utilities. Simultaneous features must share session admission; discard late responses from a previous principal.
- Keep Customer and Staff authorization separate. Public catalogue access must not depend on being a Staff member.
- Current active admins have explicit Super Admin profiles. Two protected website owners independently control other admins through `/admin/settings/admins`; no second-owner approval is required. Role text or client email checks do not confer authority.
- Register new legitimate administrative capabilities in `src/services/superAdminPolicy.js` using the exact owner-domain purpose/data scope. Respect disabled capabilities and complete suspension. Never bypass source-state, historical-integrity, customer-consent or exact-target checks.
- Keep Functions startup validation in `npm run build`. A successful Vite bundle alone cannot prove deployed server code starts.
- For auth, permissions, routes, backend dependencies or owner-service changes, run `npm run test:accounts` against local Auth 9099 and Firestore 8089 emulators, plus affected tests and `npm run build`. Use `tests/account-repair-browser.mjs` with the existing isolated local browser fixture to verify repaired existing accounts, not only newly registered ones.
- Do not call an unavailable placeholder complete, show unavailable for a confirmed loaded source, or report a live fix before the actual deployment/migration is verified.
- Production changes require current explicit owner authorization. The 2026-10-09 approval covers the account repair only, not unrelated future deployments.
