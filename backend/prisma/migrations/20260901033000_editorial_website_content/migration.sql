-- CreateEnum
CREATE TYPE "WebsiteContentStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "WebsiteContentSection" AS ENUM ('BENEFIT', 'APPLICATION', 'USAGE', 'DILUTION', 'PRECAUTION', 'PICTOGRAM', 'SEO_KEYWORD');

-- CreateEnum
CREATE TYPE "WebsiteContentSourceLayer" AS ENUM ('SOURCE_TECHNICAL', 'DERIVED_COMMERCIAL');

-- CreateEnum
CREATE TYPE "ContentExtractionConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "WebsiteContent" (
    "id" TEXT NOT NULL,
    "familyId" TEXT,
    "productId" TEXT,
    "publishedRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteContent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebsiteContent_exactly_one_target_check" CHECK (num_nonnulls("familyId", "productId") = 1)
);

-- CreateTable
CREATE TABLE "WebsiteContentRevision" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "WebsiteContentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "shortDescription" TEXT,
    "longDescription" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "technicalSheetUrl" TEXT,
    "sdsUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "approvedById" TEXT,
    "publishedById" TEXT,
    "conflictsConfirmedById" TEXT,
    "conflictsConfirmationNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "conflictsConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteContentRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebsiteContentRevision_positive_version_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "WebsiteContentEntry" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "section" "WebsiteContentSection" NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WebsiteContentEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebsiteContentEntry_nonnegative_position_check" CHECK ("position" >= 0)
);

-- CreateTable
CREATE TABLE "WebsiteContentFaq" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WebsiteContentFaq_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebsiteContentFaq_nonnegative_position_check" CHECK ("position" >= 0)
);

-- CreateTable
CREATE TABLE "WebsiteContentSource" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "layer" "WebsiteContentSourceLayer" NOT NULL,
    "sourceFile" TEXT,
    "sourceSha256" TEXT,
    "data" JSONB NOT NULL,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "confidence" "ContentExtractionConfidence",
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteContentSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteContent_familyId_key" ON "WebsiteContent"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteContent_productId_key" ON "WebsiteContent"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteContent_publishedRevisionId_key" ON "WebsiteContent"("publishedRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteContentRevision_contentId_version_key" ON "WebsiteContentRevision"("contentId", "version");

-- CreateIndex
CREATE INDEX "WebsiteContentRevision_contentId_status_idx" ON "WebsiteContentRevision"("contentId", "status");

-- CreateIndex
CREATE INDEX "WebsiteContentRevision_createdById_idx" ON "WebsiteContentRevision"("createdById");

-- CreateIndex
CREATE INDEX "WebsiteContentRevision_reviewedById_idx" ON "WebsiteContentRevision"("reviewedById");

-- CreateIndex
CREATE INDEX "WebsiteContentRevision_approvedById_idx" ON "WebsiteContentRevision"("approvedById");

-- CreateIndex
CREATE INDEX "WebsiteContentRevision_publishedById_idx" ON "WebsiteContentRevision"("publishedById");

-- CreateIndex
CREATE INDEX "WebsiteContentRevision_conflictsConfirmedById_idx" ON "WebsiteContentRevision"("conflictsConfirmedById");

-- CreateIndex
CREATE INDEX "WebsiteContentEntry_revisionId_section_position_idx" ON "WebsiteContentEntry"("revisionId", "section", "position");

-- CreateIndex
CREATE INDEX "WebsiteContentFaq_revisionId_position_idx" ON "WebsiteContentFaq"("revisionId", "position");

-- CreateIndex
CREATE INDEX "WebsiteContentSource_contentId_layer_idx" ON "WebsiteContentSource"("contentId", "layer");

-- CreateIndex
CREATE INDEX "WebsiteContentSource_createdById_idx" ON "WebsiteContentSource"("createdById");

-- CreateIndex
CREATE INDEX "WebsiteContentSource_sourceSha256_idx" ON "WebsiteContentSource"("sourceSha256");

-- AddForeignKey
ALTER TABLE "WebsiteContent" ADD CONSTRAINT "WebsiteContent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ProductFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContent" ADD CONSTRAINT "WebsiteContent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "WebsiteContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContentRevision" ADD CONSTRAINT "WebsiteContentRevision_conflictsConfirmedById_fkey" FOREIGN KEY ("conflictsConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContent" ADD CONSTRAINT "WebsiteContent_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "WebsiteContentRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContentEntry" ADD CONSTRAINT "WebsiteContentEntry_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "WebsiteContentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContentFaq" ADD CONSTRAINT "WebsiteContentFaq_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "WebsiteContentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContentSource" ADD CONSTRAINT "WebsiteContentSource_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "WebsiteContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContentSource" ADD CONSTRAINT "WebsiteContentSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Published revisions and their structured children are immutable. Editing starts
-- from a new DRAFT revision, leaving the currently published revision untouched.
CREATE FUNCTION "prevent_published_website_content_revision_mutation"()
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

CREATE TRIGGER "WebsiteContentRevision_prevent_published_update"
BEFORE UPDATE ON "WebsiteContentRevision"
FOR EACH ROW
EXECUTE FUNCTION "prevent_published_website_content_revision_mutation"();

CREATE TRIGGER "WebsiteContentRevision_prevent_published_delete"
BEFORE DELETE ON "WebsiteContentRevision"
FOR EACH ROW
EXECUTE FUNCTION "prevent_published_website_content_revision_mutation"();

CREATE FUNCTION "prevent_published_website_content_child_mutation"()
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
        RAISE EXCEPTION 'Published website content revisions are immutable';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "WebsiteContentEntry_prevent_published_mutation"
BEFORE INSERT OR UPDATE OR DELETE ON "WebsiteContentEntry"
FOR EACH ROW
EXECUTE FUNCTION "prevent_published_website_content_child_mutation"();

CREATE TRIGGER "WebsiteContentFaq_prevent_published_mutation"
BEFORE INSERT OR UPDATE OR DELETE ON "WebsiteContentFaq"
FOR EACH ROW
EXECUTE FUNCTION "prevent_published_website_content_child_mutation"();
