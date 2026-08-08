import assert from "node:assert/strict";
import { signBroadcastToken } from "../../app/lib/broadcast-token.server";

const secret = "test-secret-that-is-at-least-thirty-two-bytes-long";
const gameId = "cm1234567890_game";
const first = signBroadcastToken(gameId, "nonce-one", secret);
const same = signBroadcastToken(gameId, "nonce-one", secret);
const regenerated = signBroadcastToken(gameId, "nonce-two", secret);
assert.equal(first, same);
assert.notEqual(first, regenerated, "regeneration nonce must invalidate the previous signed token");
assert.notEqual(first, signBroadcastToken("another-game", "nonce-one", secret), "token must be bound to one game");
assert.match(first, /^[A-Za-z0-9_-]{43}$/);
console.info("Broadcast token signing and regeneration tests passed");
