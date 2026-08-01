/*
  Warnings:

  - You are about to drop the column `hostNotes` on the `Claim` table. All the data in the column will be lost.
  - You are about to drop the column `gameRunId` on the `GameWheel` table. All the data in the column will be lost.
  - Added the required column `gameRoundId` to the `GameWheel` table without a default value. This is not possible if the table is not empty.
  - Added the required column `label` to the `GameWheel` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "GameRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameRunId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GameRound_gameRunId_fkey" FOREIGN KEY ("gameRunId") REFERENCES "GameRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Claim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "facebookHandle" TEXT,
    "quantity" INTEGER NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "externalPayment" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Claim_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Claim" ("comment", "createdAt", "displayName", "expiresAt", "externalPayment", "facebookHandle", "gameId", "id", "quantity", "status", "updatedAt") SELECT "comment", "createdAt", "displayName", "expiresAt", "externalPayment", "facebookHandle", "gameId", "id", "quantity", "status", "updatedAt" FROM "Claim";
DROP TABLE "Claim";
ALTER TABLE "new_Claim" RENAME TO "Claim";
CREATE INDEX "Claim_gameId_idx" ON "Claim"("gameId");
CREATE INDEX "Claim_gameId_status_idx" ON "Claim"("gameId", "status");
CREATE TABLE "new_GameWheel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameRoundId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "label" TEXT NOT NULL,
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
    CONSTRAINT "GameWheel_gameRoundId_fkey" FOREIGN KEY ("gameRoundId") REFERENCES "GameRound" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameWheel_winnerClaimId_fkey" FOREIGN KEY ("winnerClaimId") REFERENCES "Claim" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GameWheel" ("completedAt", "createdAt", "id", "originalEntriesJson", "position", "shuffledAt", "shuffledEntriesJson", "spinDurationSeconds", "spunAt", "status", "type", "updatedAt", "winnerClaimId", "winnerDisplayName", "winnerEntryIndex", "winnerValue") SELECT "completedAt", "createdAt", "id", "originalEntriesJson", "position", "shuffledAt", "shuffledEntriesJson", "spinDurationSeconds", "spunAt", "status", "type", "updatedAt", "winnerClaimId", "winnerDisplayName", "winnerEntryIndex", "winnerValue" FROM "GameWheel";
DROP TABLE "GameWheel";
ALTER TABLE "new_GameWheel" RENAME TO "GameWheel";
CREATE INDEX "GameWheel_gameRoundId_type_idx" ON "GameWheel"("gameRoundId", "type");
CREATE INDEX "GameWheel_gameRoundId_status_idx" ON "GameWheel"("gameRoundId", "status");
CREATE INDEX "GameWheel_winnerClaimId_idx" ON "GameWheel"("winnerClaimId");
CREATE UNIQUE INDEX "GameWheel_gameRoundId_position_key" ON "GameWheel"("gameRoundId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GameRound_gameRunId_status_idx" ON "GameRound"("gameRunId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GameRound_gameRunId_position_key" ON "GameRound"("gameRunId", "position");

-- CreateIndex
CREATE INDEX "GameRun_startedAt_idx" ON "GameRun"("startedAt");
