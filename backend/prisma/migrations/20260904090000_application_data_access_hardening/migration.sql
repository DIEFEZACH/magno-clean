-- Express/Prisma connects as postgres. No application caller uses Supabase
-- REST/GraphQL; service_role is used only for Storage, outside this scope.
-- Reviewed inventory: 20 public tables, three trigger functions, no public
-- views/sequences/extensions. Drift aborts; never expand to managed objects.
-- One DO statement is atomic, including ACL/default-ACL changes and guards.
DO $application_data_access$
DECLARE
    application_tables CONSTANT TEXT[] := ARRAY[
        'User', 'RefreshToken', 'Order', 'OrderItem', 'Payment', 'Product',
        'ProductFamily', 'WebsiteContent', 'WebsiteContentRevision',
        'WebsiteContentMedia', 'WebsiteContentEntry', 'WebsiteContentFaq',
        'WebsiteContentSource', 'ProductImage', 'OrderNote', 'OrderStatusHistory',
        'CompanySettings', 'InventoryReservation', 'InventoryMovement',
        '_prisma_migrations'
    ];
    application_functions CONSTANT TEXT[] := ARRAY[
        'prevent_published_website_content_revision_mutation',
        'prevent_published_website_content_child_mutation',
        'prevent_published_website_content_media_mutation'
    ];
    owner_oid OID;
    public_oid OID;
    client_roles OID[];
    application_table TEXT;
    function_name TEXT;
    role_name TEXT;
    column_names TEXT;
    target_relation REGCLASS;
    target_function REGPROCEDURE;
    object_type TEXT;
BEGIN
    SELECT oid INTO owner_oid FROM pg_roles WHERE rolname = 'postgres';
    SELECT oid INTO public_oid FROM pg_namespace WHERE nspname = 'public';
    IF current_user <> 'postgres' OR session_user <> 'postgres'
        OR owner_oid IS NULL OR public_oid IS NULL THEN
        RAISE EXCEPTION 'Application hardening requires the reviewed postgres creator';
    END IF;
    SELECT COALESCE(array_agg(oid), ARRAY[]::OID[]) INTO client_roles
        FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role');
    IF cardinality(client_roles) <> 3
        OR EXISTS (SELECT 1 FROM pg_roles WHERE oid = ANY(client_roles)
        AND (rolsuper OR (rolname <> 'service_role' AND rolbypassrls)))
        OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member = ANY(client_roles)) THEN
        RAISE EXCEPTION 'Application hardening found unexpected client role capabilities';
    END IF;

    -- There were no public views, materialized views, sequences or foreign/
    -- partitioned tables. Do not guess their ownership or silently skip them.
    IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = public_oid
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
        AND (c.relkind <> 'r' OR c.relowner <> owner_oid
            OR NOT c.relname = ANY(application_tables)))
        OR EXISTS (SELECT 1 FROM pg_depend d JOIN pg_class c ON c.oid = d.objid
            WHERE d.classid = 'pg_class'::regclass AND d.deptype = 'e'
                AND c.relnamespace = public_oid AND c.relname = ANY(application_tables)) THEN
        RAISE EXCEPTION 'Application hardening found unexpected public relation inventory';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = public_oid
        AND (p.proowner <> owner_oid OR p.prokind <> 'f' OR p.pronargs <> 0
            OR p.prorettype <> 'trigger'::regtype OR p.prosecdef
            OR NOT p.proname = ANY(application_functions)))
        OR EXISTS (SELECT 1 FROM pg_depend d JOIN pg_proc p ON p.oid = d.objid
            WHERE d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
                AND p.pronamespace = public_oid) THEN
        RAISE EXCEPTION 'Application hardening found unexpected public routine inventory';
    END IF;

    -- No global defaults existed in the reviewed environments. Permit only the
    -- owner and the built-in PUBLIC function EXECUTE equivalent; other global
    -- grants need a new design, not broader revocation across managed schemas.
    IF EXISTS (SELECT 1 FROM pg_default_acl d
        CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclrole = owner_oid AND d.defaclnamespace = 0
            AND a.grantee <> owner_oid
            AND NOT (d.defaclobjtype = 'f' AND a.grantee = 0
                AND a.privilege_type = 'EXECUTE'))
        OR EXISTS (SELECT 1 FROM pg_default_acl d
            CROSS JOIN LATERAL aclexplode(d.defaclacl) a
            WHERE d.defaclrole = owner_oid AND d.defaclnamespace = public_oid
                AND d.defaclobjtype IN ('r', 'S', 'f')
                AND a.grantee <> owner_oid AND a.grantee <> 0
                AND NOT a.grantee = ANY(client_roles)) THEN
        RAISE EXCEPTION 'Application hardening found unexpected creator default privileges';
    END IF;

    FOREACH application_table IN ARRAY application_tables LOOP
        target_relation := to_regclass(format('%I.%I', 'public', application_table));
        IF target_relation IS NULL THEN
            RAISE EXCEPTION 'Application hardening requires every expected table';
        END IF;
        IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = target_relation) THEN
            RAISE EXCEPTION 'Application hardening found unexpected row security policies';
        END IF;
        IF EXISTS (SELECT 1 FROM pg_class WHERE oid = target_relation AND relforcerowsecurity) THEN
            RAISE EXCEPTION 'Application hardening found unexpected FORCE RLS';
        END IF;
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', application_table);
        SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO column_names
            FROM pg_attribute WHERE attrelid = target_relation AND attnum > 0 AND NOT attisdropped;
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC', 'public', application_table);
        EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE %I.%I FROM PUBLIC', column_names, 'public', application_table);
        FOR role_name IN SELECT rolname FROM pg_roles WHERE oid = ANY(client_roles) LOOP
            EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', 'public', application_table, role_name);
            EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE %I.%I FROM %I', column_names, 'public', application_table, role_name);
            IF has_table_privilege(role_name, target_relation, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
                OR has_any_column_privilege(role_name, target_relation, 'SELECT, INSERT, UPDATE, REFERENCES') THEN
                RAISE EXCEPTION 'Application hardening found remaining client privileges';
            END IF;
        END LOOP;
    END LOOP;

    FOREACH function_name IN ARRAY application_functions LOOP
        target_function := to_regprocedure(format('%I.%I()', 'public', function_name));
        IF target_function IS NULL THEN
            RAISE EXCEPTION 'Application hardening requires every expected trigger function';
        END IF;
        EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %I.%I() FROM PUBLIC', 'public', function_name);
        FOR role_name IN SELECT rolname FROM pg_roles WHERE oid = ANY(client_roles) LOOP
            EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %I.%I() FROM %I', 'public', function_name, role_name);
            IF has_function_privilege(role_name, target_function, 'EXECUTE') THEN
                RAISE EXCEPTION 'Application hardening found remaining routine privileges';
            END IF;
        END LOOP;
    END LOOP;

    -- Per-schema defaults are additive: they cannot cancel the built-in global
    -- PUBLIC EXECUTE default. This one explicitly reviewed GLOBAL change affects
    -- future postgres-created functions in ANY schema, not existing routines.
    -- Do not compensate by granting PUBLIC access to extensions/auth/storage.
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
    FOREACH object_type IN ARRAY ARRAY['TABLES', 'SEQUENCES', 'FUNCTIONS'] LOOP
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON %s FROM PUBLIC', object_type);
        FOR role_name IN SELECT rolname FROM pg_roles WHERE oid = ANY(client_roles) LOOP
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON %s FROM %I', object_type, role_name);
        END LOOP;
    END LOOP;
    -- Only postgres may receive creator defaults for these object classes in
    -- global/public scope. Other creators and other schema ACLs remain untouched.
    IF EXISTS (SELECT 1 FROM pg_default_acl d
        CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclrole = owner_oid AND d.defaclnamespace IN (0, public_oid)
            AND d.defaclobjtype IN ('r', 'S', 'f') AND a.grantee <> owner_oid)
        OR NOT EXISTS (SELECT 1 FROM pg_default_acl d
            WHERE d.defaclrole = owner_oid AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f') THEN
        RAISE EXCEPTION 'Application hardening found remaining creator default privileges';
    END IF;
END;
$application_data_access$;
