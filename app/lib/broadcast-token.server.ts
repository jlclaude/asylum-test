import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import db from "../db.server";

function signingSecret() {
  const secret = process.env.BROADCAST_TOKEN_SECRET ?? process.env.SHOPIFY_API_SECRET;
  if (!secret || secret.length < 32) throw new Error("BROADCAST_TOKEN_SECRET or SHOPIFY_API_SECRET must be configured.");
  return secret;
}

export function signBroadcastToken(gameId: string, nonce: string, secret = signingSecret()) { return createHmac("sha256", secret).update(`asylum-broadcast:v1:${gameId}:${nonce}`).digest("base64url"); }
function nonce() { return randomBytes(32).toString("base64url"); }
function equalToken(first: string, second: string) { const a = Buffer.from(first); const b = Buffer.from(second); return a.length === b.length && timingSafeEqual(a, b); }

export async function getOrCreateBroadcastToken(gameId: string, shop: string) {
  const game = await db.game.findFirst({ where: { id: gameId, shop }, select: { id: true, broadcastTokenNonce: true } });
  if (!game) return null;
  const value = game.broadcastTokenNonce ?? nonce();
  if (!game.broadcastTokenNonce) await db.game.update({ where: { id: game.id }, data: { broadcastTokenNonce: value } });
  return signBroadcastToken(game.id, value);
}

export async function regenerateBroadcastToken(gameId: string, shop: string) {
  const value = nonce();
  const result = await db.game.updateMany({ where: { id: gameId, shop }, data: { broadcastTokenNonce: value } });
  return result.count === 1 ? signBroadcastToken(gameId, value) : null;
}

export async function validBroadcastToken(gameId: string, token: string) {
  if (!token || token.length > 200) return false;
  const game = await db.game.findUnique({ where: { id: gameId }, select: { broadcastTokenNonce: true } });
  return Boolean(game?.broadcastTokenNonce && equalToken(token, signBroadcastToken(gameId, game.broadcastTokenNonce)));
}

export function broadcastSourceUrl(origin: string, gameId: string, token: string) { return `${origin}/broadcast/${encodeURIComponent(gameId)}?token=${encodeURIComponent(token)}`; }
