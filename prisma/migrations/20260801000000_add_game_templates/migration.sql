-- CreateTable
CREATE TABLE "GameTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultGameTitle" TEXT,
    "defaultGameDescription" TEXT,
    "totalSpots" INTEGER NOT NULL,
    "pricePerSpot" DECIMAL NOT NULL,
    "wheelCount" INTEGER NOT NULL DEFAULT 2,
    "initialStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "GameTemplate_shop_idx" ON "GameTemplate"("shop");

-- CreateIndex
CREATE INDEX "GameTemplate_shop_updatedAt_idx" ON "GameTemplate"("shop", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameTemplate_shop_name_key" ON "GameTemplate"("shop", "name");
