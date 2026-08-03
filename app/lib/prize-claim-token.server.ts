import { createHash, randomBytes } from "node:crypto";

export function hashPrizeClaimToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generatePrizeClaimToken() {
  return randomBytes(32).toString("base64url");
}
