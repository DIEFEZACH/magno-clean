DROP TRIGGER IF EXISTS "WebsiteContentFaq_prevent_published_mutation" ON "WebsiteContentFaq";
DROP TRIGGER IF EXISTS "WebsiteContentEntry_prevent_published_mutation" ON "WebsiteContentEntry";
DROP TRIGGER IF EXISTS "WebsiteContentRevision_prevent_published_delete" ON "WebsiteContentRevision";
DROP TRIGGER IF EXISTS "WebsiteContentRevision_prevent_published_update" ON "WebsiteContentRevision";

DROP FUNCTION IF EXISTS "prevent_published_website_content_child_mutation"();
DROP FUNCTION IF EXISTS "prevent_published_website_content_revision_mutation"();

ALTER TABLE "WebsiteContent" DROP CONSTRAINT IF EXISTS "WebsiteContent_publishedRevisionId_fkey";

DROP TABLE IF EXISTS "WebsiteContentSource";
DROP TABLE IF EXISTS "WebsiteContentFaq";
DROP TABLE IF EXISTS "WebsiteContentEntry";
DROP TABLE IF EXISTS "WebsiteContentRevision";
DROP TABLE IF EXISTS "WebsiteContent";

DROP TYPE IF EXISTS "ContentExtractionConfidence";
DROP TYPE IF EXISTS "WebsiteContentSourceLayer";
DROP TYPE IF EXISTS "WebsiteContentSection";
DROP TYPE IF EXISTS "WebsiteContentStatus";
