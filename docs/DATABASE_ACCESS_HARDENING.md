# Application database access hardening — proposed security correction

This separate PR is based on frozen release `050f890f2704b0b6d6a57c7e76e5520525b8c835`. It has not been applied to a persistent database and does not authorize deployment. The release remains **NO_GO** until an authorized successor incorporates the correction, resolves the remaining blockers and is certified again.

## Confirmed finding and architecture

Read-only metadata confirmed RLS disabled and effective `anon`, `authenticated` and `service_role` access to application objects in `public`. This includes legacy sensitive/commercial tables in production and the complete 20-table release schema in staging. Both Data APIs initially exposed `public` and `graphql_public`, with automatic exposure of new tables. A controlled staging-only containment test then disabled its Data API: authenticated zero-row REST and GraphQL probes changed to unavailable while Express/Prisma, frontend, sitemap and Storage checks stayed healthy. Production's Data API was only inspected and remains enabled. No sensitive row values or credentials were inspected.

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
5. Run CI and isolated PostgreSQL tests. Apply only through an explicitly authorized staging step; this PR itself has made no persistent local, staging or production DB change.
6. After application, verify all 20 RLS flags, absence of table/column/function/sequence/view access for all three Data API roles, creator defaults, unchanged managed-schema ACL/default snapshots, real Prisma/API/admin behavior and Storage access. Do not test a real checkout or payment.
7. Production requires a separate authorization after staging evidence. Opening or merging this PR is not mitigation of current live permissions.

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

## Rollback

Do not disable RLS, restore client/PUBLIC grants or use destructive `rollback.sql` to revert application code. Preserve the hardening while reverting application deployments if necessary. A failed application should leave no partial changes because the statement is atomic; inspect metadata before any retry. Any exceptional application grant or extension-upgrade compatibility action requires its own narrow review and authorization.
