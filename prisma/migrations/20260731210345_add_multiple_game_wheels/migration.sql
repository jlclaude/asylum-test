-- CreateTable
CREATE TABLE "GameRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "GameRun_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameWheel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameRunId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "originalEntriesJson" TEXT NOT NULL,
    "shuffledEntriesJson" TEXT NOT NULL,
    "spinDurationSeconds" INTEGER,
    "winnerEntryIndex" INTEGER,
    "winnerClaimId" TEXT,
    "winnerDisplayName" TEXT,
    "winnerValue" TEXT,
    "shuffledAt" DATETIME,
    "spunAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GameWheel_gameRunId_fkey" FOREIGN KEY ("gameRunId") REFERENCES "GameRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameWheel_winnerClaimId_fkey" FOREIGN KEY ("winnerClaimId") REFERENCES "Claim" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Game" ("createdAt", "description", "id", "pricePerSpot", "shop", "status", "title", "totalSpots", "updatedAt") SELECT "createdAt", "description", "id", "pricePerSpot", "shop", "status", "title", "totalSpots", "updatedAt" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE INDEX "Game_shop_idx" ON "Game"("shop");
CREATE INDEX "Game_shop_status_idx" ON "Game"("shop", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GameRun_gameId_key" ON "GameRun"("gameId");

-- CreateIndex
CREATE INDEX "GameWheel_gameRunId_type_idx" ON "GameWheel"("gameRunId", "type");

-- CreateIndex
CREATE INDEX "GameWheel_winnerClaimId_idx" ON "GameWheel"("winnerClaimId");

-- CreateIndex
CREATE UNIQUE INDEX "GameWheel_gameRunId_position_key" ON "GameWheel"("gameRunId", "position");
