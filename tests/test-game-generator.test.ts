import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeterministicTestClaims,
  isDevelopmentTestGame,
  persistedGameStatusFor,
  TEST_GAME_DESCRIPTION_MARKER,
  TEST_GAME_TITLE,
  testGameToolsEnabled,
} from "../app/lib/test-game-generator.ts";

test("tools require development mode and the explicit flag", () => {
  assert.equal(testGameToolsEnabled({ NODE_ENV: "development", ENABLE_TEST_GAME_TOOLS: "true" }), true);
  assert.equal(testGameToolsEnabled({ NODE_ENV: "production", ENABLE_TEST_GAME_TOOLS: "true" }), false);
  assert.equal(testGameToolsEnabled({ NODE_ENV: "development", ENABLE_TEST_GAME_TOOLS: "false" }), false);
  assert.equal(testGameToolsEnabled({ NODE_ENV: "development" }), false);
});

test("deterministic claims preserve duplicates and valid quantities", () => {
  const first = buildDeterministicTestClaims(20, "ALL_PAID");
  const second = buildDeterministicTestClaims(20, "ALL_PAID");
  assert.deepEqual(first, second);
  assert.equal(first.length, 20);
  assert.equal(new Set(first.map((claim) => claim.displayName.toLocaleLowerCase())).size < first.length, true);
  assert.equal(first.every((claim) => claim.quantity >= 1 && claim.quantity <= 8), true);
  assert.equal(first.every((claim) => claim.status === "CONFIRMED" && claim.externalPayment), true);
  assert.equal(first.reduce((sum, claim) => sum + claim.quantity, 0) <= 100, true);
});

test("mixed and pending modes create their documented states", () => {
  const mixed = buildDeterministicTestClaims(15, "MIXED");
  assert.equal(mixed.some((claim) => claim.status === "CONFIRMED" && claim.externalPayment), true);
  assert.equal(mixed.some((claim) => claim.status === "PENDING"), true);
  assert.equal(mixed.some((claim) => claim.status === "CANCELED"), true);
  const pending = buildDeterministicTestClaims(15, "PENDING");
  assert.equal(pending.every((claim) => claim.status === "PENDING" && !claim.externalPayment), true);
});

test("claim count validation rejects values outside 15 through 25", () => {
  assert.throws(() => buildDeterministicTestClaims(14, "ALL_PAID"));
  assert.throws(() => buildDeterministicTestClaims(26, "ALL_PAID"));
});

test("deletion identity requires both exact development markers", () => {
  assert.equal(isDevelopmentTestGame({ title: TEST_GAME_TITLE, description: TEST_GAME_DESCRIPTION_MARKER }), true);
  assert.equal(isDevelopmentTestGame({ title: "Normal Game", description: TEST_GAME_DESCRIPTION_MARKER }), false);
  assert.equal(isDevelopmentTestGame({ title: TEST_GAME_TITLE, description: "Normal description" }), false);
  assert.equal(isDevelopmentTestGame({ title: TEST_GAME_TITLE, description: null }), false);
});

test("initial state maps to persisted pre-run status", () => {
  assert.equal(persistedGameStatusFor("OPEN"), "OPEN");
  assert.equal(persistedGameStatusFor("CLOSED"), "CLOSED");
  assert.equal(persistedGameStatusFor("INITIALIZED"), "CLOSED");
});
