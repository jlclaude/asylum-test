import { createHash, randomBytes } from "node:crypto";

export function hashPrizeClaimToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generatePrizeClaimToken() {
  return randomBytes(32).toString("base64url");
}

export function buildPrizeClaimUrl(
  token: string,
  fallbackOrigin: string,
  configuredOrigin = process.env.SHOPIFY_APP_URL,
) {
  const origin = new URL(configuredOrigin?.trim() || fallbackOrigin).origin;
  return new URL(`/prize-claim/${encodeURIComponent(token)}`, origin).toString();
}
