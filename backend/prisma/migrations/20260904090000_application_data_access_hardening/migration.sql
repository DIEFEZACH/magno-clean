-- Application tables are served only through the authenticated/serialized
-- Express API. Supabase client roles must not bypass those contracts via SQL
-- or a Data API exposing public. This is intentionally an explicit table list:
-- do not change auth/storage schemas, global defaults, backend grants or rows.
-- One DO statement keeps all changes atomic if any guard or REVOKE fails.
DO $application_data_access$
DECLARE
    application_tables CONSTANT TEXT[] := ARRAY[
        'User',
        'RefreshToken',
        'Order',
        'OrderItem',
        'Payment',
        'Product',
        'ProductFamily',
        'WebsiteContent',
        'WebsiteContentRevision',
        'WebsiteContentMedia',
        'WebsiteContentEntry',
        'WebsiteContentFaq',
        'WebsiteContentSource',
        'ProductImage',
        'OrderNote',
        'OrderStatusHistory',
        'CompanySettings',
        'InventoryReservation',
        'InventoryMovement',
        '_prisma_migrations'
    ];
    application_table TEXT;
    client_role TEXT;
    target_relation REGCLASS;
BEGIN
    FOREACH application_table IN ARRAY application_tables LOOP
        -- Missing tables are an unexpected migration state, not a reason to
        -- silently skip protection. All 19 models and Prisma history must exist.
        target_relation := to_regclass(format('%I.%I', 'public', application_table));
        IF target_relation IS NULL THEN
            RAISE EXCEPTION 'Application access hardening requires every expected table';
        END IF;

        -- A policy can exist even while RLS is disabled. Do not activate an
        -- unexpected permissive policy or remove somebody else's policy.
        IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = target_relation) THEN
            RAISE EXCEPTION 'Application access hardening found unexpected row security policies';
        END IF;

        -- No FORCE: the table owner/backend remains able to use Prisma.
        -- No client policy: client access is denied independently of Express.
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', application_table);
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC', 'public', application_table);

        -- These Supabase roles may not exist in a vanilla local PostgreSQL.
        -- Do not create roles, grant memberships, or assume service_role exists.
        FOR client_role IN
            SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
        LOOP
            EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', 'public', application_table, client_role);

            -- Fail closed if custom membership/ownership or another grantor
            -- still gives effective access. Do not revoke unrelated roles.
            IF has_table_privilege(client_role, target_relation, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
                OR has_any_column_privilege(client_role, target_relation, 'SELECT, INSERT, UPDATE, REFERENCES') THEN
                RAISE EXCEPTION 'Application access hardening found remaining client privileges';
            END IF;
        END LOOP;
    END LOOP;
END;
$application_data_access$;
