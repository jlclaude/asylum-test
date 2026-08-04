-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('OPEN', 'CLOSED', 'READY', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('READY', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WheelType" AS ENUM ('NAME', 'VALUE');

-- CreateEnum
CREATE TYPE "WheelStatus" AS ENUM ('READY', 'SPINNING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PrizeClaimStatus" AS ENUM ('OPEN', 'SUBMITTED', 'REVIEWED', 'FULFILLED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "paymentInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalSpots" INTEGER NOT NULL,
    "pricePerSpot" DECIMAL(65,30) NOT NULL,
    "wheelCount" INTEGER NOT NULL DEFAULT 2,
    "secondChanceOffset" INTEGER NOT NULL DEFAULT 2,
    "raffleNumber" INTEGER NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'OPEN',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopRaffleSequence" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopRaffleSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTemplate" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultGameTitle" TEXT,
    "defaultGameDescription" TEXT,
    "totalSpots" INTEGER NOT NULL,
    "pricePerSpot" DECIMAL(65,30) NOT NULL,
    "wheelCount" INTEGER NOT NULL DEFAULT 2,
    "initialStatus" "GameStatus" NOT NULL DEFAULT 'OPEN',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "facebookHandle" TEXT,
    "quantity" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "externalPayment" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRun" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "secondChanceCalculatedAt" TIMESTAMP(3),
    "secondChanceSourceWheelId" TEXT,
    "secondChanceBeforeClaimId" TEXT,
    "secondChanceBeforeDisplayName" TEXT,
    "secondChanceBeforeEntryIndex" INTEGER,
    "secondChanceAfterClaimId" TEXT,
    "secondChanceAfterDisplayName" TEXT,
    "secondChanceAfterEntryIndex" INTEGER,

    CONSTRAINT "GameRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRound" (
    "id" TEXT NOT NULL,
    "gameRunId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT,
    "status" "RoundStatus" NOT NULL DEFAULT 'READY',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameWheel" (
    "id" TEXT NOT NULL,
    "gameRoundId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "WheelType" NOT NULL,
    "status" "WheelStatus" NOT NULL DEFAULT 'READY',
    "label" TEXT NOT NULL,
    "originalEntriesJson" TEXT NOT NULL,
    "shuffledEntriesJson" TEXT NOT NULL,
    "spinDurationSeconds" INTEGER,
    "winnerEntryIndex" INTEGER,
    "winnerClaimId" TEXT,
    "winnerDisplayName" TEXT,
    "winnerValue" TEXT,
    "shuffledAt" TIMESTAMP(3),
    "spunAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "resultAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameWheel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeClaim" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameWheelId" TEXT NOT NULL,
    "activeGameWheelId" TEXT,
    "winnerClaimId" TEXT,
    "winnerDisplayName" TEXT NOT NULL,
    "wheelLabel" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenLastFour" TEXT NOT NULL,
    "encryptedToken" TEXT,
    "status" "PrizeClaimStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "preferredPrize" TEXT,
    "prizeOptionsJson" TEXT,
    "selectedPrizeOptionId" TEXT,
    "selectedPrizeOptionLabel" TEXT,
    "selectedPrizeOptionJson" TEXT,
    "selectedBallsJson" TEXT,
    "recipientName" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "stateProvince" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "winnerNotes" TEXT,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrizeClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");

-- CreateIndex
CREATE INDEX "Game_shop_idx" ON "Game"("shop");

-- CreateIndex
CREATE INDEX "Game_shop_status_idx" ON "Game"("shop", "status");

-- CreateIndex
CREATE INDEX "Game_shop_archivedAt_idx" ON "Game"("shop", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Game_shop_raffleNumber_key" ON "Game"("shop", "raffleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ShopRaffleSequence_shop_key" ON "ShopRaffleSequence"("shop");

-- CreateIndex
CREATE INDEX "GameTemplate_shop_idx" ON "GameTemplate"("shop");

-- CreateIndex
CREATE INDEX "GameTemplate_shop_updatedAt_idx" ON "GameTemplate"("shop", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameTemplate_shop_name_key" ON "GameTemplate"("shop", "name");

-- CreateIndex
CREATE INDEX "Claim_gameId_idx" ON "Claim"("gameId");

-- CreateIndex
CREATE INDEX "Claim_gameId_status_idx" ON "Claim"("gameId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GameRun_gameId_key" ON "GameRun"("gameId");

-- CreateIndex
CREATE INDEX "GameRun_startedAt_idx" ON "GameRun"("startedAt");

-- CreateIndex
CREATE INDEX "GameRound_gameRunId_status_idx" ON "GameRound"("gameRunId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GameRound_gameRunId_position_key" ON "GameRound"("gameRunId", "position");

-- CreateIndex
CREATE INDEX "GameWheel_gameRoundId_type_idx" ON "GameWheel"("gameRoundId", "type");

-- CreateIndex
CREATE INDEX "GameWheel_gameRoundId_status_idx" ON "GameWheel"("gameRoundId", "status");

-- CreateIndex
CREATE INDEX "GameWheel_winnerClaimId_idx" ON "GameWheel"("winnerClaimId");

-- CreateIndex
CREATE UNIQUE INDEX "GameWheel_gameRoundId_position_key" ON "GameWheel"("gameRoundId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PrizeClaim_activeGameWheelId_key" ON "PrizeClaim"("activeGameWheelId");

-- CreateIndex
CREATE UNIQUE INDEX "PrizeClaim_tokenHash_key" ON "PrizeClaim"("tokenHash");

-- CreateIndex
CREATE INDEX "PrizeClaim_shop_idx" ON "PrizeClaim"("shop");

-- CreateIndex
CREATE INDEX "PrizeClaim_gameId_idx" ON "PrizeClaim"("gameId");

-- CreateIndex
CREATE INDEX "PrizeClaim_gameWheelId_idx" ON "PrizeClaim"("gameWheelId");

-- CreateIndex
CREATE INDEX "PrizeClaim_shop_status_idx" ON "PrizeClaim"("shop", "status");

-- CreateIndex
CREATE INDEX "PrizeClaim_generatedAt_idx" ON "PrizeClaim"("generatedAt");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRun" ADD CONSTRAINT "GameRun_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_gameRunId_fkey" FOREIGN KEY ("gameRunId") REFERENCES "GameRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWheel" ADD CONSTRAINT "GameWheel_gameRoundId_fkey" FOREIGN KEY ("gameRoundId") REFERENCES "GameRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWheel" ADD CONSTRAINT "GameWheel_winnerClaimId_fkey" FOREIGN KEY ("winnerClaimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeClaim" ADD CONSTRAINT "PrizeClaim_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeClaim" ADD CONSTRAINT "PrizeClaim_gameWheelId_fkey" FOREIGN KEY ("gameWheelId") REFERENCES "GameWheel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeClaim" ADD CONSTRAINT "PrizeClaim_winnerClaimId_fkey" FOREIGN KEY ("winnerClaimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
