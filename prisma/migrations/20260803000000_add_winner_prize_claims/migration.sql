-- AlterTable
ALTER TABLE "GameWheel" ADD COLUMN "resultAcceptedAt" DATETIME;

-- CreateTable
CREATE TABLE "PrizeClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameWheelId" TEXT NOT NULL,
    "activeGameWheelId" TEXT,
    "winnerClaimId" TEXT,
    "winnerDisplayName" TEXT NOT NULL,
    "wheelLabel" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenLastFour" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expiresAt" DATETIME,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "reviewedAt" DATETIME,
    "fulfilledAt" DATETIME,
    "revokedAt" DATETIME,
    "preferredPrize" TEXT,
    "backupPrize" TEXT,
    "sizeOrVariant" TEXT,
    "recipientName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "stateProvince" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "winnerNotes" TEXT,
    "adminNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrizeClaim_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrizeClaim_gameWheelId_fkey" FOREIGN KEY ("gameWheelId") REFERENCES "GameWheel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrizeClaim_winnerClaimId_fkey" FOREIGN KEY ("winnerClaimId") REFERENCES "Claim" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PrizeClaim_activeGameWheelId_key" ON "PrizeClaim"("activeGameWheelId");
CREATE UNIQUE INDEX "PrizeClaim_tokenHash_key" ON "PrizeClaim"("tokenHash");
CREATE INDEX "PrizeClaim_shop_idx" ON "PrizeClaim"("shop");
CREATE INDEX "PrizeClaim_gameId_idx" ON "PrizeClaim"("gameId");
CREATE INDEX "PrizeClaim_gameWheelId_idx" ON "PrizeClaim"("gameWheelId");
CREATE INDEX "PrizeClaim_shop_status_idx" ON "PrizeClaim"("shop", "status");
CREATE INDEX "PrizeClaim_generatedAt_idx" ON "PrizeClaim"("generatedAt");
