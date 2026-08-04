ALTER TABLE "Game" ADD COLUMN "raffleYear" INTEGER;
UPDATE "Game" SET "raffleYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER;
ALTER TABLE "Game" ALTER COLUMN "raffleYear" SET NOT NULL;

DROP INDEX "Game_shop_raffleNumber_key";
CREATE UNIQUE INDEX "Game_shop_raffleYear_raffleNumber_key" ON "Game"("shop", "raffleYear", "raffleNumber");
CREATE INDEX "Game_shop_raffleYear_idx" ON "Game"("shop", "raffleYear");
CREATE INDEX "Game_shop_raffleYear_raffleNumber_idx" ON "Game"("shop", "raffleYear", "raffleNumber");

ALTER TABLE "ShopRaffleSequence" ADD COLUMN "year" INTEGER;
UPDATE "ShopRaffleSequence" SET "year" = 2026;
ALTER TABLE "ShopRaffleSequence" ALTER COLUMN "year" SET NOT NULL;
DROP INDEX "ShopRaffleSequence_shop_key";
CREATE UNIQUE INDEX "ShopRaffleSequence_shop_year_key" ON "ShopRaffleSequence"("shop", "year");
CREATE INDEX "ShopRaffleSequence_shop_year_idx" ON "ShopRaffleSequence"("shop", "year");

INSERT INTO "ShopRaffleSequence" ("id", "shop", "year", "nextValue", "createdAt", "updatedAt")
SELECT 'migrated_' || md5("shop" || ':' || "raffleYear"::text), "shop", "raffleYear", MAX("raffleNumber") + 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Game"
WHERE "raffleYear" <> 2026
GROUP BY "shop", "raffleYear"
ON CONFLICT ("shop", "year") DO UPDATE
SET "nextValue" = GREATEST("ShopRaffleSequence"."nextValue", EXCLUDED."nextValue");

UPDATE "ShopRaffleSequence" sequence
SET "nextValue" = GREATEST(sequence."nextValue", grouped."nextValue")
FROM (
    SELECT "shop", MAX("raffleNumber") + 1 AS "nextValue"
    FROM "Game" WHERE "raffleYear" = 2026 GROUP BY "shop"
) grouped
WHERE sequence."shop" = grouped."shop" AND sequence."year" = 2026;
