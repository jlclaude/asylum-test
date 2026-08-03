-- Remove prize-request fields that are no longer collected or displayed.
ALTER TABLE "PrizeClaim" DROP COLUMN "backupPrize";
ALTER TABLE "PrizeClaim" DROP COLUMN "sizeOrVariant";
ALTER TABLE "PrizeClaim" DROP COLUMN "email";
ALTER TABLE "PrizeClaim" DROP COLUMN "phone";
