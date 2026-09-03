DROP TRIGGER IF EXISTS "WebsiteContentMedia_prevent_published_mutation" ON "WebsiteContentMedia";
DROP FUNCTION IF EXISTS "prevent_published_website_content_media_mutation"();
DROP TABLE IF EXISTS "WebsiteContentMedia";
DROP TYPE IF EXISTS "WebsiteContentMediaRole";

-- Restore the exact previous trigger function when rolling this migration back.
CREATE OR REPLACE FUNCTION "prevent_published_website_content_revision_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD."status" = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Published website content revisions are immutable';
    END IF;

    RETURN NEW;
END;
$$;
