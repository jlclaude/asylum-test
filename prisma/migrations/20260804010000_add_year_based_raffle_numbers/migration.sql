PRAGMA foreign_keys=OFF;

-- Clean up staging tables left by an interrupted SQLite table rebuild.
DROP TABLE IF EXISTS "new_Game";
DROP TABLE IF EXISTS "new_ShopRaffleSequence";

CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalSpots" INTEGER NOT NULL,
    "pricePerSpot" DECIMAL NOT NULL,
    "wheelCount" INTEGER NOT NULL DEFAULT 2,
    "secondChanceOffset" INTEGER NOT NULL DEFAULT 2,
    "raffleYear" INTEGER NOT NULL,
    "raffleNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Game" (
    "id", "shop", "title", "description", "totalSpots", "pricePerSpot",
    "wheelCount", "secondChanceOffset", "raffleYear", "raffleNumber", "status",
    "archivedAt", "createdAt", "updatedAt"
)
SELECT
    "id", "shop", "title", "description", "totalSpots", "pricePerSpot",
    "wheelCount", "secondChanceOffset",
    CAST(strftime('%Y', "createdAt" / 1000, 'unixepoch') AS INTEGER),
    "raffleNumber", "status", "archivedAt", "createdAt", "updatedAt"
FROM "Game";

DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE UNIQUE INDEX "Game_shop_raffleYear_raffleNumber_key" ON "Game"("shop", "raffleYear", "raffleNumber");
CREATE INDEX "Game_shop_idx" ON "Game"("shop");
CREATE INDEX "Game_shop_raffleYear_idx" ON "Game"("shop", "raffleYear");
CREATE INDEX "Game_shop_raffleYear_raffleNumber_idx" ON "Game"("shop", "raffleYear", "raffleNumber");
CREATE INDEX "Game_shop_status_idx" ON "Game"("shop", "status");
CREATE INDEX "Game_shop_archivedAt_idx" ON "Game"("shop", "archivedAt");

CREATE TABLE "new_ShopRaffleSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_ShopRaffleSequence" ("id", "shop", "year", "nextValue", "createdAt", "updatedAt")
SELECT 'raffle_sequence_' || lower(hex(randomblob(16))), "shop", "raffleYear", MAX("raffleNumber") + 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Game"
GROUP BY "shop", "raffleYear";

-- The former global counter belongs to the migration year. Retaining its higher
-- value prevents reuse of numbers consumed by games that were permanently deleted.
UPDATE "new_ShopRaffleSequence"
SET "nextValue" = MAX("nextValue", COALESCE((
    SELECT old."nextValue" FROM "ShopRaffleSequence" old
    WHERE old."shop" = "new_ShopRaffleSequence"."shop"
), "nextValue"))
WHERE "year" = 2026;

INSERT INTO "new_ShopRaffleSequence" ("id", "shop", "year", "nextValue", "createdAt", "updatedAt")
SELECT old."id", old."shop", 2026, old."nextValue", old."createdAt", old."updatedAt"
FROM "ShopRaffleSequence" old
WHERE NOT EXISTS (
    SELECT 1 FROM "new_ShopRaffleSequence" current
    WHERE current."shop" = old."shop" AND current."year" = 2026
);

DROP TABLE "ShopRaffleSequence";
ALTER TABLE "new_ShopRaffleSequence" RENAME TO "ShopRaffleSequence";
CREATE UNIQUE INDEX "ShopRaffleSequence_shop_year_key" ON "ShopRaffleSequence"("shop", "year");
CREATE INDEX "ShopRaffleSequence_shop_year_idx" ON "ShopRaffleSequence"("shop", "year");

PRAGMA foreign_keys=ON;
PRAGMA foreign_key_check;
