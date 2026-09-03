-- Correct DELETE semantics for non-published revisions. PUBLISHED revisions
-- continue to reject UPDATE and DELETE.
CREATE OR REPLACE FUNCTION "prevent_published_website_content_revision_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD."status" = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Published website content revisions are immutable';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TYPE "WebsiteContentMediaRole" AS ENUM ('HERO', 'BENEFITS', 'USAGE', 'SAFETY', 'INFOGRAPHIC');

CREATE TABLE "WebsiteContentMedia" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "role" "WebsiteContentMediaRole" NOT NULL,
    "bucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "editorialWarning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteContentMedia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebsiteContentMedia_position_check" CHECK ("position" >= 0),
    CONSTRAINT "WebsiteContentMedia_width_check" CHECK ("width" IS NULL OR "width" > 0),
    CONSTRAINT "WebsiteContentMedia_height_check" CHECK ("height" IS NULL OR "height" > 0),
    CONSTRAINT "WebsiteContentMedia_byteSize_check" CHECK ("byteSize" > 0 AND "byteSize" <= 10485760),
    CONSTRAINT "WebsiteContentMedia_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "WebsiteContentMedia_mimeType_check" CHECK ("mimeType" = 'image/webp'),
    CONSTRAINT "WebsiteContentMedia_bucket_check" CHECK ("bucket" = 'product-media')
);

CREATE UNIQUE INDEX "WebsiteContentMedia_revisionId_role_position_key"
ON "WebsiteContentMedia"("revisionId", "role", "position");

CREATE UNIQUE INDEX "WebsiteContentMedia_revisionId_bucket_storagePath_key"
ON "WebsiteContentMedia"("revisionId", "bucket", "storagePath");

CREATE INDEX "WebsiteContentMedia_revisionId_role_position_idx"
ON "WebsiteContentMedia"("revisionId", "role", "position");

ALTER TABLE "WebsiteContentMedia"
ADD CONSTRAINT "WebsiteContentMedia_revisionId_fkey"
FOREIGN KEY ("revisionId") REFERENCES "WebsiteContentRevision"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Structured media is immutable together with its PUBLISHED revision. This
-- also blocks a cascade that would delete published editorial history.
CREATE FUNCTION "prevent_published_website_content_media_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_revision_id TEXT;
BEGIN
    target_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."revisionId" ELSE NEW."revisionId" END;

    IF EXISTS (
        SELECT 1
        FROM "WebsiteContentRevision"
        WHERE "id" = target_revision_id
          AND "status" = 'PUBLISHED'
    ) THEN
        RAISE EXCEPTION 'Published website content media are immutable';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "WebsiteContentMedia_prevent_published_mutation"
BEFORE INSERT OR UPDATE OR DELETE ON "WebsiteContentMedia"
FOR EACH ROW
EXECUTE FUNCTION "prevent_published_website_content_media_mutation"();
