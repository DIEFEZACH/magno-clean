# Application database access hardening — proposed security correction

This is a separate security PR, based on frozen release `050f890f2704b0b6d6a57c7e76e5520525b8c835`. It does not authorize deployment or database changes. That release remains **NO_GO** until a reviewed correction is incorporated into a newly authorized, newly certified release SHA.

## Finding and scope

Read-only metadata confirmed disabled RLS and effective `anon` SELECT/INSERT/UPDATE/DELETE grants on User, RefreshToken, Order, Payment, InventoryMovement and Product in both production and staging. This is pre-existing in production; the visible release has not been deployed there. Staging additionally confirmed ProductFamily and all six WebsiteContent tables with the same issue. No sensitive rows were read and no HTTP exploitation or writes were attempted. The actual exposed PostgREST schemas still need independent confirmation; the database privileges themselves are confirmed.

Express authentication and its PUBLISHED-only serializer do not protect a direct database API path if the schema is exposed. Supabase recommends enabling RLS and removing unnecessary client grants together. This application serves public and admin data through Express/Prisma, not through direct client-role access to its tables. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Migration `20260904090000_application_data_access_hardening` protects exactly these 19 Prisma models, plus Prisma migration metadata:

- User, RefreshToken.
- Order, OrderItem, Payment, OrderNote, OrderStatusHistory.
- Product, ProductFamily, ProductImage.
- WebsiteContent, WebsiteContentRevision, WebsiteContentMedia, WebsiteContentEntry, WebsiteContentFaq, WebsiteContentSource.
- CompanySettings, InventoryReservation, InventoryMovement.
- `_prisma_migrations`.

It enables RLS and revokes ALL table privileges from PUBLIC and from existing `anon` / `authenticated` roles. It does not add client policies, use FORCE RLS, revoke owner/service_role grants, change role memberships, change global default privileges, touch auth/storage schemas, or modify rows, prices, stock, payments, editorial publication, storage objects, credentials or checkout settings. Existing migrations 1–9 and Prisma models are unchanged.

## Failure and compatibility behavior

- One DO statement makes the security change atomic: a missing expected table or remaining effective client privilege raises an exception, aborting the whole statement.
- Supabase roles absent from vanilla PostgreSQL are skipped; they are not created. PUBLIC grants are still removed.
- The checks include inherited table and column privileges. A custom inherited grant, ownership, elevated client role, or another grantor can make the migration fail closed. Investigate that role path; do not broaden the revocation or use CASCADE automatically. PostgreSQL table revocation also removes corresponding column grants. [PostgreSQL 17 REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html).
- Without FORCE RLS, table owners keep their normal access. BYPASSRLS roles such as service_role still require and retain their existing table grants. The actual backend database role must be an authorized owner/BYPASSRLS role with the needed grants; a custom non-owner role relying on PUBLIC would be denied and needs an explicit reviewed access design before application. No role values or connection strings should be printed. [PostgreSQL 17 row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
- RLS provides a second row-level barrier if SELECT/INSERT/UPDATE/DELETE grants are accidentally restored. It is not a replacement for privilege revocation: table-wide operations such as TRUNCATE are not filtered by RLS.
- ALTER TABLE obtains locks on the application tables. Plan a controlled maintenance window and inspect lock wait; do not kill unrelated sessions. No lock-time guarantee is asserted from the in-memory tests.
- No automatic build/start migration hook is added. Public catalog, login and admin runtime code are unchanged. Storage access uses the existing backend path; auth and storage schema policies are deliberately out of scope.

## Required gates before any future application

1. Review this PR, the frozen-release NO_GO report, the actual exposed Data API schemas and effective backend/client role paths.
2. Obtain explicit authority for the new remediation/release plan, including a containment plan for direct Data API exposure during migration. Do not apply the originally blocked migrations 7–9 and leave an unprotected intermediate state. In production, tables 7–9 are currently absent; migration 10 intentionally requires them. A reviewer must choose a safe authorized deployment/containment sequence, not infer one from this document.
3. Verify a current backup, frozen production deployment, target identity, owner/BYPASSRLS compatibility, all expected tables, absence of unexpected client-role memberships and unchanged checkout-disabled state. Never print credentials or read user/token rows for this purpose.
4. Run the separate security correction through CI and controlled staging validation after authorization. This task applied it only to disposable in-memory PostgreSQL fixtures, never to local persistent, staging or production databases.
5. After authorized application, verify all 20 table RLS flags, effective denial of table/column privileges for client roles and unchanged owner/service_role capability. Validate the public Express API contract and authenticated backend sessions; do not perform a real checkout or payment.
6. Keep the release NO_GO until the security evidence and remaining certification blockers are resolved under a new approved SHA. Merely opening this PR is not mitigation of the current production permissions.

Read-only inspection should use table/role metadata only (`pg_class`, `pg_namespace`, `pg_roles`, `has_table_privilege`, `has_any_column_privilege`). Verify RLS=true, FORCE=false, and all client access flags=false for every allowlisted table. No public allow policy is expected. Inspect exposed RPC/views separately if present; this table-only correction does not claim a full PostgREST surface audit.

## Local verification

The existing locked dependency tree contains `@electric-sql/pglite` 0.4.3 transitively through Prisma tooling. No dependency or lockfile changes were made. The new test imports it only in the test file and uses `new PGlite()` without a dataDir: isolated in-memory PostgreSQL 17.5, synthetic tables/roles/rows, no network, credentials or persisted database. Production/staging PostgreSQL 17.6 behavior still needs the authorized environment validation described above.

Executed locally:

```sh
cd backend
npm run build
node --test dist/services/databaseAccessHardening.test.js
```

Nine tests cover exact schema/allowlist coverage, RLS/grant SQL, scope restrictions, unchanged checksums for 7–9, real SQL execution, anon/authenticated SELECT/INSERT/UPDATE/DELETE/TRUNCATE denial across all 20 tables, owner and service_role CRUD preservation, default-deny row policies after restored grants, absent Supabase roles, and atomic failure for missing tables/inherited grants. Tests intentionally fail if the locked PGlite helper disappears; they do not silently skip security coverage.

Validation on 2026-09-04: TypeScript build passed; targeted suite passed 9/9 (0 skipped); full backend suite passed 227/227 (0 failed, 0 skipped; 2.96 seconds) with the complete synthetic environment from the existing CI workflow. A first local full-suite invocation omitted five required CI configuration fields and failed during configuration loading; supplying those synthetic fields fixed the invocation without any code/configuration-file change. No private environment file was loaded.

The embedded table fixtures test PostgreSQL authorization semantics, not production rows, real Supabase Data API routing, full FK/trigger behavior or operational lock contention. Those checks are not represented as completed here.

## Operational rollback

Do not disable RLS, restore public grants or run rollback.sql in response to an application rollback. Revert frontend/backend deployments only as appropriate and preserve hardening. If a custom backend role fails after application, stop and inspect the reviewed role design; any narrowly scoped grant change needs explicit review. There is no destructive rollback script in this PR and no database restore is required by this change.
