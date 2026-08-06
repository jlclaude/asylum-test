ALTER TABLE "Claim" ADD COLUMN "normalizedDisplayName" TEXT;

CREATE TABLE "ClaimNameReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "normalizedDisplayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClaimNameReservation_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClaimNameReservation_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Claim_gameId_normalizedDisplayName_idx" ON "Claim"("gameId", "normalizedDisplayName");
CREATE UNIQUE INDEX "ClaimNameReservation_claimId_key" ON "ClaimNameReservation"("claimId");
CREATE UNIQUE INDEX "ClaimNameReservation_gameId_normalizedDisplayName_key" ON "ClaimNameReservation"("gameId", "normalizedDisplayName");
CREATE INDEX "ClaimNameReservation_gameId_idx" ON "ClaimNameReservation"("gameId");
