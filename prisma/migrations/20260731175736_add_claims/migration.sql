-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "facebookHandle" TEXT,
    "quantity" INTEGER NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "externalPayment" BOOLEAN NOT NULL DEFAULT false,
    "hostNotes" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Claim_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Claim_gameId_idx" ON "Claim"("gameId");

-- CreateIndex
CREATE INDEX "Claim_gameId_status_idx" ON "Claim"("gameId", "status");
