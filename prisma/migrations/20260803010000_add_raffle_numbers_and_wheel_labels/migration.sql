PRAGMA foreign_keys=OFF;

-- Rebuild Game so every existing row receives a required shop-scoped raffle number.
CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalSpots" INTEGER NOT NULL,
    "pricePerSpot" DECIMAL NOT NULL,
    "wheelCount" INTEGER NOT NULL DEFAULT 2,
    "secondChanceOffset" INTEGER NOT NULL DEFAULT 2,
    "raffleNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Game" (
    "id", "shop", "title", "description", "totalSpots", "pricePerSpot",
    "wheelCount", "secondChanceOffset", "raffleNumber", "status",
    "archivedAt", "createdAt", "updatedAt"
)
SELECT
    "id", "shop", "title", "description", "totalSpots", "pricePerSpot",
    "wheelCount", "secondChanceOffset",
    ROW_NUMBER() OVER (PARTITION BY "shop" ORDER BY "createdAt" ASC, "id" ASC),
    "status", "archivedAt", "createdAt", "updatedAt"
FROM "Game";

DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE INDEX "Game_shop_idx" ON "Game"("shop");
CREATE INDEX "Game_shop_status_idx" ON "Game"("shop", "status");
CREATE INDEX "Game_shop_archivedAt_idx" ON "Game"("shop", "archivedAt");
CREATE UNIQUE INDEX "Game_shop_raffleNumber_key" ON "Game"("shop", "raffleNumber");

CREATE TABLE "ShopRaffleSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ShopRaffleSequence_shop_key" ON "ShopRaffleSequence"("shop");

INSERT INTO "ShopRaffleSequence" ("id", "shop", "nextValue", "createdAt", "updatedAt")
SELECT
    'raffle_sequence_' || lower(hex(randomblob(16))),
    "shop",
    MAX("raffleNumber") + 1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Game"
GROUP BY "shop";

-- Existing legal runs contain at most 20 name wheels. The formula also covers AA-ZZ.
UPDATE "GameWheel"
SET "label" = CASE
    WHEN "type" = 'VALUE' THEN 'Reward Chamber'
    WHEN "position" <= 26 THEN 'Containment ' || char(64 + "position")
    ELSE 'Containment ' || char(64 + (("position" - 1) / 26)) || char(65 + (("position" - 1) % 26))
END;

-- Prize claims retain their source identity while adopting the normalized display label.
UPDATE "PrizeClaim"
SET "wheelLabel" = (
    SELECT "GameWheel"."label"
    FROM "GameWheel"
    WHERE "GameWheel"."id" = "PrizeClaim"."gameWheelId"
)
WHERE EXISTS (
    SELECT 1 FROM "GameWheel" WHERE "GameWheel"."id" = "PrizeClaim"."gameWheelId"
);

PRAGMA foreign_keys=ON;
PRAGMA foreign_key_check;
