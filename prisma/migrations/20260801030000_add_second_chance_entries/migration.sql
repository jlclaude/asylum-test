-- AlterTable
ALTER TABLE "GameRun" ADD COLUMN "secondChanceAfterClaimId" TEXT;
ALTER TABLE "GameRun" ADD COLUMN "secondChanceAfterDisplayName" TEXT;
ALTER TABLE "GameRun" ADD COLUMN "secondChanceAfterEntryIndex" INTEGER;
ALTER TABLE "GameRun" ADD COLUMN "secondChanceBeforeClaimId" TEXT;
ALTER TABLE "GameRun" ADD COLUMN "secondChanceBeforeDisplayName" TEXT;
ALTER TABLE "GameRun" ADD COLUMN "secondChanceBeforeEntryIndex" INTEGER;
ALTER TABLE "GameRun" ADD COLUMN "secondChanceCalculatedAt" DATETIME;
ALTER TABLE "GameRun" ADD COLUMN "secondChanceSourceWheelId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalSpots" INTEGER NOT NULL,
    "pricePerSpot" DECIMAL NOT NULL,
    "wheelCount" INTEGER NOT NULL DEFAULT 2,
    "secondChanceOffset" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Game" ("archivedAt", "createdAt", "description", "id", "pricePerSpot", "shop", "status", "title", "totalSpots", "updatedAt", "wheelCount") SELECT "archivedAt", "createdAt", "description", "id", "pricePerSpot", "shop", "status", "title", "totalSpots", "updatedAt", "wheelCount" FROM "Game";
-- Give every existing game its own persisted value from 2 through 10.
UPDATE "new_Game" SET "secondChanceOffset" = 2 + abs(random() % 9);
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE INDEX "Game_shop_idx" ON "Game"("shop");
CREATE INDEX "Game_shop_status_idx" ON "Game"("shop", "status");
CREATE INDEX "Game_shop_archivedAt_idx" ON "Game"("shop", "archivedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
