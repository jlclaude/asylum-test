-- AlterTable
ALTER TABLE "Game" ADD COLUMN "archivedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Game_shop_archivedAt_idx" ON "Game"("shop", "archivedAt");
