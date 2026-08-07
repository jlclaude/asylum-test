import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { allocateNextRaffleIdentity } from "../app/models/raffle-number.server.ts";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

test("clean PostgreSQL supports raffle concurrency, idempotency, uniqueness, and cascades", {
  skip: databaseUrl ? false : "POSTGRES_TEST_DATABASE_URL is not configured.",
}, async () => {
  const url = new URL(databaseUrl!);
  if (!/^(localhost|127\.0\.0\.1)$/.test(url.hostname) || !url.pathname.includes("asylum_")) {
    throw new Error("Integration tests require a local disposable asylum_* PostgreSQL database.");
  }
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  const shop = `postgres-test-${Date.now()}.myshopify.com`;
  try {
    await db.session.create({ data: {
      id: `session-${Date.now()}`, shop, state: "test", isOnline: false,
      accessToken: "temporary-test-token",
    } });

    const games = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      db.$transaction(async (tx) => {
        const identity = await allocateNextRaffleIdentity({
          tx, shop, now: new Date("2026-08-04T12:00:00.000Z"),
        });
        return tx.game.create({ data: {
          shop, title: `PostgreSQL Test ${index + 1}`, totalSpots: 20,
          pricePerSpot: "12.50", wheelCount: 1, secondChanceOffset: 7,
          raffleYear: identity.raffleYear, raffleNumber: identity.raffleNumber,
          status: "CLOSED",
        } });
      }),
    ));
    assert.deepEqual(games.map((game) => game.raffleNumber).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);

    const game = games[0];
    const claim = await db.claim.create({ data: {
      gameId: game.id, displayName: "PostgreSQL Winner", quantity: 2,
      status: "CONFIRMED", externalPayment: true,
    } });
    const run = await db.gameRun.create({ data: { gameId: game.id } });
    const round = await db.gameRound.create({ data: { gameRunId: run.id, position: 1, title: "Round 1" } });
    const wheel = await db.gameWheel.create({ data: {
      gameRoundId: round.id, position: 1, type: "NAME", label: "Containment A",
      originalEntriesJson: JSON.stringify([{ claimId: claim.id, displayName: claim.displayName }]),
      shuffledEntriesJson: JSON.stringify([{ claimId: claim.id, displayName: claim.displayName }]),
      winnerEntryIndex: 0, winnerClaimId: claim.id, winnerDisplayName: claim.displayName,
    } });

    const concurrentSpins = await Promise.all([
      db.gameWheel.updateMany({
        where: { id: wheel.id, status: "READY", updatedAt: wheel.updatedAt },
        data: { status: "SPINNING", winnerEntryIndex: 0, spunAt: new Date() },
      }),
      db.gameWheel.updateMany({
        where: { id: wheel.id, status: "READY", updatedAt: wheel.updatedAt },
        data: { status: "SPINNING", winnerEntryIndex: 1, spunAt: new Date() },
      }),
    ]);
    assert.equal(concurrentSpins.reduce((sum, result) => sum + result.count, 0), 1);
    assert.equal((await db.gameWheel.findUniqueOrThrow({ where: { id: wheel.id } })).status, "SPINNING");

    const firstCompletion = await db.gameWheel.updateMany({
      where: { id: wheel.id, status: "SPINNING" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    const duplicateCompletion = await db.gameWheel.updateMany({
      where: { id: wheel.id, status: "SPINNING" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    assert.equal(firstCompletion.count, 1);
    assert.equal(duplicateCompletion.count, 0);

    const firstSecondChance = await db.gameRun.updateMany({
      where: { id: run.id, secondChanceCalculatedAt: null },
      data: { secondChanceCalculatedAt: new Date(), secondChanceSourceWheelId: wheel.id },
    });
    const duplicateSecondChance = await db.gameRun.updateMany({
      where: { id: run.id, secondChanceCalculatedAt: null },
      data: { secondChanceCalculatedAt: new Date() },
    });
    assert.equal(firstSecondChance.count, 1);
    assert.equal(duplicateSecondChance.count, 0);

    await db.prizeClaim.create({ data: {
      shop, gameId: game.id, gameWheelId: wheel.id, activeGameWheelId: wheel.id,
      winnerClaimId: claim.id, winnerDisplayName: claim.displayName, wheelLabel: wheel.label,
      tokenHash: `hash-${Date.now()}`, tokenLastFour: "test",
    } });
    await assert.rejects(() => db.prizeClaim.create({ data: {
      shop, gameId: game.id, gameWheelId: wheel.id, activeGameWheelId: wheel.id,
      winnerClaimId: claim.id, winnerDisplayName: claim.displayName, wheelLabel: wheel.label,
      tokenHash: `hash-duplicate-${Date.now()}`, tokenLastFour: "test",
    } }), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002"));

    await db.game.delete({ where: { id: game.id } });
    assert.equal(await db.claim.count({ where: { gameId: game.id } }), 0);
    assert.equal(await db.gameRun.count({ where: { gameId: game.id } }), 0);
    assert.equal(await db.prizeClaim.count({ where: { gameId: game.id } }), 0);
  } finally {
    await db.game.deleteMany({ where: { shop } });
    await db.shopRaffleSequence.deleteMany({ where: { shop } });
    await db.session.deleteMany({ where: { shop } });
    await db.$disconnect();
  }
});
