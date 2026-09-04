# Application database access hardening — proposed security correction

This separate PR is based on frozen release `050f890f2704b0b6d6a57c7e76e5520525b8c835`. Its frozen migration was applied and verified only in staging on 2026-09-04; it has not been applied to production and does not authorize deployment. The release remains **NO_GO** until an authorized successor incorporates the correction, resolves the remaining blockers and is certified again.

## Confirmed finding and architecture

Read-only metadata confirmed RLS disabled and effective `anon`, `authenticated` and `service_role` access to application objects in `public`. This includes legacy sensitive/commercial tables in production and the complete 20-table release schema in staging. Both Data APIs initially exposed `public` and `graphql_public`, with automatic exposure of new tables. Controlled containment subsequently disabled the Data API in both environments. In staging, authenticated zero-row REST and GraphQL probes changed to unavailable while Express/Prisma, frontend, sitemap and Storage checks stayed healthy. Production containment was separately authorized and did not apply this migration or change application-table RLS/grants. Disabling the Data API reduces the reachable surface but does not replace the migration's defense-in-depth controls. No sensitive row values or credentials were inspected.

Application traffic uses Express/Prisma with the `postgres` database role. Repository, CI and runtime inspection found no Supabase REST/GraphQL application access. `service_role` is used only against `/storage/v1`; its grants/defaults and managed objects in `storage` are preserved. Therefore none of the three Data API roles needs privileges on application objects in `public`.

## Exact reviewed scope

Migration `20260904090000_application_data_access_hardening` expects the reviewed inventory exactly:

- 19 Prisma model tables plus `_prisma_migrations`, all owned by `postgres`.
- Three `postgres`-owned, zero-argument, invoker-rights trigger functions: `prevent_published_website_content_revision_mutation`, `prevent_published_website_content_child_mutation`, and `prevent_published_website_content_media_mutation`.
- No views, materialized views, sequences, foreign/partitioned tables, routines with other signatures, extension-owned objects or row policies in `public`.

Unexpected object kinds/names, missing client roles, owners, routine attributes, extension membership, policies, FORCE RLS, client-role memberships/elevation, creator identity or default-ACL grantees abort the entire statement. This prevents silently expanding into Supabase-managed or newly introduced objects. Existing migrations 1–9 and the Prisma schema are unchanged.

For all 20 tables, the migration enables RLS without FORCE and revokes table and explicit column privileges from PUBLIC, `anon`, `authenticated` and `service_role`. It verifies that no effective table/column privileges remain, including inherited `MAINTAIN`. For the three functions it revokes and verifies `EXECUTE` for the same principals. No policies are added: client access remains default-deny even if a row-level grant is later restored. Table-wide operations such as TRUNCATE still depend on the ACL revocation.

`postgres` remains owner and BYPASSRLS, retaining Prisma and migration access without a new grant. No users, memberships, credentials, rows, Storage objects, application settings or runtime code change.

## Future-object defaults and unavoidable global effect

The real creator in both environments is `postgres`. Its current `public` default ACL grants tables, sequences and functions to all three Data API roles. The migration removes those schema-specific defaults and PUBLIC defaults for future `postgres`-created `public` tables/sequences/functions.

PostgreSQL schema-specific defaults are additive: they cannot cancel the built-in global PUBLIC `EXECUTE` on newly created functions. The migration therefore performs one reviewed global default change:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

This does not change existing functions anywhere. It does affect every function created by `postgres` in the future, regardless of schema. The reviewed environments have 49 existing `postgres`-owned extension routines outside `public` (pgcrypto, pg_stat_statements and uuid-ossp); those objects and their ACLs remain untouched. `storage` has explicit schema defaults for `anon`, `authenticated` and `service_role`, so future Storage functions retain those grants despite the global revocation.

Extension upgrades or other future tooling that creates a `postgres` function outside `public` must verify and, if genuinely required, apply an explicit narrow schema/object grant. Do not add blanket PUBLIC grants or compensating changes to `auth`, `storage`, `extensions`, `graphql_public` or other managed schemas. This upgrade gate is an intentional compatibility cost of denying implicit executable RPCs.

Defaults owned by `supabase_admin`, `supabase_auth_admin` and every creator other than `postgres` are outside this correction and unchanged. Consequently, future application DDL must continue to use the reviewed `postgres` creator; creating an application object as another role requires a separate access review.

## Atomicity and compatibility

The migration is one `DO` statement. Any guard, revoke, effective-access verification or default-ACL postcondition failure rolls back RLS, table/column/function ACLs and default ACLs together. It neither swallows failures nor makes a partial inventory “best effort.”

- No FORCE RLS or client policies.
- No grants, ownership transfers, role creation/membership changes or CASCADE.
- No changes to Supabase managed schemas, existing extension functions, Storage defaults/policies, global defaults of other creators or application data.
- No build/start migration hook. Applying it still requires a controlled window because table ACL/RLS changes take locks.

The real trigger functions are preserved and their PUBLISHED immutability behavior is exercised locally. Revoking direct EXECUTE does not prevent triggers from invoking them.

## Required gates before application

1. Keep the candidate NO_GO and review the exact SQL/diff plus the before-metadata reports.
2. Use a successor SHA and authorized migration manifest that contains migrations 7–10 in the approved order; never leave tables 7–9 exposed in an intermediate release state.
3. Confirm the target identity, `postgres` creator/owner, exact object inventory/default ACLs and absence of drift with read-only metadata immediately before application.
4. Confirm the backend still connects as `postgres`, `service_role` remains Storage-only, CHECKOUT remains disabled, the current backup is accepted and the global function-default compatibility cost is approved.
5. Run CI and isolated PostgreSQL tests. The authorized staging application is complete; any retry must first prove why it is required. Production application remains separately gated.
6. After application, verify all 20 RLS flags, absence of table/column/function/sequence/view access for all three Data API roles, creator defaults, unchanged managed-schema ACL/default snapshots, real Prisma/API/admin behavior and Storage access. Do not test a real checkout or payment.
7. Production migration remains separately authorized work after staging evidence. Its Data API is already disabled as containment, but application-table RLS/grants remain unremediated; opening or merging this PR does not apply the defense-in-depth migration.

## Local verification

The locked dependency tree already contains `@electric-sql/pglite` 0.4.3. Tests use only `new PGlite()` without a data directory: PostgreSQL-compatible, in-memory fixtures with synthetic roles/objects/rows, no network, credentials or persistent database.

Coverage includes:

- Exact 20-table/three-function inventories and immutable checksums for migrations 7–9.
- Table plus explicit-column revocation and real SELECT/INSERT/UPDATE/DELETE/TRUNCATE denial for `anon`, `authenticated` and `service_role` across all 20 tables.
- Function EXECUTE denial, retained `postgres` CRUD and real PUBLISHED trigger behavior.
- New table/view/materialized-view/sequence/invoker-function/SECURITY-DEFINER-function defaults.
- Existing managed objects, Storage access/defaults and other creators remaining byte-for-byte equal in catalog snapshots; the separately documented global effect on future `postgres` functions is tested.
- Atomic failure for missing/drifted objects, owner/type/signature/security drift, extension membership, policy/FORCE RLS, inherited table/column/MAINTAIN access, elevated/member client roles, unknown default grantees and a late default-ACL failure.

These fixtures prove SQL authorization/transaction behavior, not operational locks, PostgREST routing, production data or a real Supabase upgrade. Those require the gated environment checks above.

## Staging evidence — 2026-09-04

The exact migration with SHA-256 `d00b0982192923709ebbb36a99cee6fcf2323a6d36117ec32d57069a847fbabb` was applied through `prisma migrate deploy` to project `heqneuhptatgybddoply` using TLS `verify-full` and the official CA. `prisma migrate status` reports 10/10 and no pending migration.

- All 20 reviewed tables have RLS enabled, FORCE disabled and zero policies.
- Effective table and column privileges are absent for `anon`, `authenticated` and `service_role`. Controlled transactional tests received permission denial for SELECT, INSERT, UPDATE, DELETE and TRUNCATE on every table.
- The three reviewed trigger functions deny direct EXECUTE to PUBLIC and all three client roles. Future table, view, materialized view, sequence and function defaults were tested inside a transaction and left no objects behind.
- `postgres` selected all 20 tables; Express `/health`, `/ready`, `/api/products` and `/api/catalog` returned 200. A temporary staging-only admin completed login, `/me`, refresh, logout and six read-only admin routes, then its user and refresh tokens were removed.
- Data API remains disabled: authenticated REST and GraphQL probes return `PGRST002`. Storage bucket metadata/listing and a public WebP HEAD remain 200; no Storage write was attempted.
- Baseline stayed at 98 products, 25 families, 79 linked variants, zero stock/reserved stock and no orders/payments. Managed relation/function/default-ACL snapshots outside `public` are unchanged; `product-media` remains at 218 objects.
- Security Advisor rerun: 0 errors, 3 warnings for mutable search paths on the invoker-rights trigger functions, and 20 informational `RLS Enabled No Policy` findings. The no-policy findings are intentional default-deny behavior. The search-path warnings remain documented hardening work; no function body or migration 7–9 was rewritten.
- Production was audited read-only after the staging migration and remained byte-for-byte equal in the captured application metadata/count snapshot: six migrations and 98 products. Its Data API was disabled afterward under a separate containment authorization. Migration 10 is still not applied there, so the application-table RLS/grants finding remains and containment must not be represented as a substitute for the migration.

## Rollback

Do not disable RLS, restore client/PUBLIC grants or use destructive `rollback.sql` to revert application code. Preserve the hardening while reverting application deployments if necessary. A failed application should leave no partial changes because the statement is atomic; inspect metadata before any retry. Any exceptional application grant or extension-upgrade compatibility action requires its own narrow review and authorization.
