CREATE TABLE "ProductFamily" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "badge" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "variantType" TEXT NOT NULL DEFAULT 'Presentación',
    "alwaysShowAsFamily" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductFamily_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Product"
ADD COLUMN "familyId" TEXT,
ADD COLUMN "variantLabel" TEXT,
ADD COLUMN "variantSortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Product" ADD CONSTRAINT "Product_variantSortOrder_nonnegative" CHECK ("variantSortOrder" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_family_variant_label" CHECK ("familyId" IS NULL OR ("variantLabel" IS NOT NULL AND btrim("variantLabel") <> ''));

CREATE UNIQUE INDEX "ProductFamily_slug_key" ON "ProductFamily"("slug");
CREATE INDEX "ProductFamily_active_idx" ON "ProductFamily"("active");
CREATE INDEX "ProductFamily_featured_idx" ON "ProductFamily"("featured");
CREATE UNIQUE INDEX "Product_familyId_variantLabel_key" ON "Product"("familyId", "variantLabel");
CREATE INDEX "Product_familyId_variantSortOrder_idx" ON "Product"("familyId", "variantSortOrder");

ALTER TABLE "Product" ADD CONSTRAINT "Product_familyId_fkey"
FOREIGN KEY ("familyId") REFERENCES "ProductFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;
