DROP TABLE "ClaimNameReservation";

DROP INDEX "Claim_gameId_normalizedDisplayName_idx";

ALTER TABLE "Claim" DROP COLUMN "normalizedDisplayName";
