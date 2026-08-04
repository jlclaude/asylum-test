import db from "../db.server";
import {
  buildDeterministicTestClaims,
  isDevelopmentTestGame,
  persistedGameStatusFor,
  TEST_GAME_DELETE_CONFIRMATION,
  TEST_GAME_DESCRIPTION_MARKER,
  testGameToolsEnabled,
  type TestGameOptions,
} from "../lib/test-game-generator";
import { createClaimWithTransaction } from "../models/claim.server";
import { beginGameRun } from "../models/game-run.server";
import { createGameWithTransaction } from "../models/game.server";
import { runGameReadinessCheck } from "./game-readiness.server";

function assertEnabled() {
  if (!testGameToolsEnabled()) throw new Error("Development test-game tools are disabled.");
}

export async function createDevelopmentTestGame(input: {
  shop: string;
} & TestGameOptions) {
  assertEnabled();
  const claims = buildDeterministicTestClaims(
    input.claimCount,
    input.paymentMode,
    input.includeDuplicateNames,
  );
  const reservedQuantity = claims
    .filter((claim) => claim.status === "PENDING" || claim.status === "CONFIRMED")
    .reduce((total, claim) => total + claim.quantity, 0);
  if (reservedQuantity > input.totalSpots) {
    throw new Error(`Generated active claims reserve ${reservedQuantity} spots, exceeding the ${input.totalSpots}-spot capacity.`);
  }
  const game = await db.$transaction(async (transaction) => {
    const created = await createGameWithTransaction(transaction, {
      shop: input.shop,
      title: `[TEST] ${input.title}`,
      description: `${TEST_GAME_DESCRIPTION_MARKER}\nDeterministic development fixture. Safe to delete with the development tool.`,
      totalSpots: input.totalSpots,
      pricePerSpot: input.pricePerSpot,
      wheelCount: input.wheelCount,
      status: "OPEN",
    });
    const baseTime = new Date();
    for (const [index, claim] of claims.entries()) {
      await createClaimWithTransaction(transaction, {
        gameId: created.id,
        ...claim,
        comment: `Deterministic test claim ${index + 1}`,
        createdAt: new Date(baseTime.getTime() + index),
      });
    }
    if (input.initialState !== "OPEN") {
      return transaction.game.update({
        where: { id: created.id },
        data: { status: persistedGameStatusFor(input.initialState) },
      });
    }
    return created;
  });

  let initializationError: string | null = null;
  if (input.initialState === "INITIALIZED") {
    try {
      await beginGameRun(game.id, input.shop);
    } catch (error) {
      initializationError = error instanceof Error ? error.message : "Game initialization failed.";
      console.error("Development test game initialization failed", { gameId: game.id, error });
    }
  }
  const readiness = input.initialState === "OPEN"
    ? null
    : await runGameReadinessCheck(game.id, input.shop);
  const saved = await db.game.findFirstOrThrow({ where: { id: game.id, shop: input.shop } });
  return {
    game: { id: saved.id, title: saved.title, raffleNumber: saved.raffleNumber, status: saved.status },
    claimCount: claims.length,
    paidSpotCount: claims.filter((claim) => claim.status === "CONFIRMED" && claim.externalPayment)
      .reduce((total, claim) => total + claim.quantity, 0),
    readiness,
    initializationError,
  };
}

export async function deleteDevelopmentTestGame(input: {
  shop: string;
  gameId: string;
  confirmation: string;
}) {
  assertEnabled();
  if (input.confirmation !== TEST_GAME_DELETE_CONFIRMATION) {
    throw new Error(`Type ${TEST_GAME_DELETE_CONFIRMATION} to confirm deletion.`);
  }
  return db.$transaction(async (transaction) => {
    const game = await transaction.game.findFirst({
      where: { id: input.gameId, shop: input.shop },
      select: { id: true, title: true, description: true },
    });
    if (!game) throw new Error("Test game not found for this shop.");
    if (!isDevelopmentTestGame(game)) {
      throw new Error("This game does not contain the required development-test markers.");
    }
    await transaction.game.delete({ where: { id: game.id } });
    return { id: game.id, title: game.title };
  });
}
