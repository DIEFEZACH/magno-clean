ALTER TABLE "ProductImage" ADD COLUMN "storagePath" TEXT;
CREATE UNIQUE INDEX "ProductImage_storagePath_key" ON "ProductImage"("storagePath");
