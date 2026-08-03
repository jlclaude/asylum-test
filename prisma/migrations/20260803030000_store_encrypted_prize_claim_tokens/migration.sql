-- Existing claim links remain valid but cannot be revealed because their
-- original one-way-hashed tokens cannot be reconstructed.
ALTER TABLE "PrizeClaim" ADD COLUMN "encryptedToken" TEXT;
