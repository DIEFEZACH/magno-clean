ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_familyId_fkey";
DROP INDEX IF EXISTS "Product_familyId_variantSortOrder_idx";
DROP INDEX IF EXISTS "Product_familyId_variantLabel_key";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_family_variant_label";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_variantSortOrder_nonnegative";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "variantSortOrder", DROP COLUMN IF EXISTS "variantLabel", DROP COLUMN IF EXISTS "familyId";
DROP TABLE IF EXISTS "ProductFamily";
