import { data } from "react-router";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { WheelActionData } from "../components/wheel/types";
import {
  beginGameRun,
  acceptGameWheelResult,
  completeGameWheelSpin,
  deserializeWheelEntries,
  getGameRun,
  selectGameWheelDuration,
  shuffleGameWheel,
  startGameWheelSpin,
  StaleWheelStateError,
} from "../models/game-run.server";
import { getGameForShop } from "../models/game.server";
import { getGameResults } from "../models/game-results.server";
import { getSecondChanceResult } from "../models/second-chance.server";
import { formatRaffleCode } from "../lib/raffle-number";
import {
  PRIZE_CLAIM_EXPIRATION_DAYS,
  type PrizeClaimExpirationDays,
} from "../lib/prize-claim";
import { buildPrizeClaimUrl } from "../lib/prize-claim-token.server";
import { validateAdminPrizePackageOptions } from "../lib/prize-packages";
import { verifyPrizeOptionCollections } from "../lib/shopify-prize-products.server";
import {
  createWinnerPrizeClaim,
  getEligiblePrizeWheels,
  getPrizeClaimsForGame,
  toPrizeClaimSummary,
  updatePrizeClaimStatus,
} from "../models/prize-claim.server";
import { runGameReadinessCheck } from "./game-readiness.server";
import type { OperatorContext } from "../lib/operator-context.server";

export async function loadGameModeData(gameId: string, shop: string) {
  const game = await getGameForShop(gameId, shop);
  if (!game) throw new Response("Game not found.", { status: 404 });
  const readiness = await runGameReadinessCheck(game.id, shop);
  if (!readiness.isReady)
    throw new Response(
      `${readiness.blockingCount} blocking readiness issues must be resolved in the Game Control Center.`,
      { status: 409, statusText: "Game readiness check failed" },
    );
  const [run, results, secondChance, eligiblePrizeWheels, prizeClaims] =
    await Promise.all([
      getGameRun(game.id),
      getGameResults(game.id),
      getSecondChanceResult(game.id),
      getEligiblePrizeWheels(game.id, shop),
      getPrizeClaimsForGame(game.id, shop),
    ]);
  return {
    game: {
      id: game.id,
      raffleCode: formatRaffleCode({
        year: game.raffleYear,
        number: game.raffleNumber,
      }),
      title: game.title,
      description: game.description,
      secondChanceOffset: game.secondChanceOffset,
      status: game.status,
      archivedAt: game.archivedAt?.toISOString() ?? null,
      wheelCount: game.wheelCount,
      totalSpots: game.totalSpots,
      pricePerSpot: game.pricePerSpot.toString(),
      createdAt: game.createdAt.toISOString(),
    },
    results,
    secondChance,
    eligiblePrizeWheels: eligiblePrizeWheels.map((wheel) => ({
      ...wheel,
      resultAcceptedAt: wheel.resultAcceptedAt?.toISOString() ?? null,
    })),
    prizeClaims: prizeClaims.map(toPrizeClaimSummary),
    run: run
      ? {
          id: run.id,
          rounds: run.rounds.map((round) => ({
            id: round.id,
            title: round.title ?? `Round ${round.position}`,
            status: round.status,
            wheels: round.wheels.map((wheel) => ({
              id: wheel.id,
              type: wheel.type,
              label: wheel.label,
              status: wheel.status,
              entries: deserializeWheelEntries(wheel.shuffledEntriesJson),
              spinDurationSeconds: wheel.spinDurationSeconds,
              winnerEntryIndex: wheel.winnerEntryIndex,
              winnerDisplayName: wheel.winnerDisplayName,
              winnerValue: wheel.winnerValue,
              spunAt: wheel.spunAt?.toISOString() ?? null,
              resultAcceptedAt: wheel.resultAcceptedAt?.toISOString() ?? null,
            })),
          })),
        }
      : null,
  };
}

export async function handleGameModeAction(input: {
  request: Request;
  gameId: string;
  operator: OperatorContext;
  admin: AdminApiContext | null;
}) {
  const formData = await input.request.formData();
  const intent = String(formData.get("intent") ?? "");
  const wheelId = String(formData.get("wheelId") ?? "").trim();
  try {
    if (intent === "begin-game") {
      const readiness = await runGameReadinessCheck(input.gameId, input.operator.shop);
      if (!readiness.isReady)
        return {
          intent,
          error: `${readiness.blockingCount} blocking readiness issues must be resolved in the Game Control Center.`,
        };
      await beginGameRun(input.gameId, input.operator.shop);
      return { intent, success: "Containment wheels initialized." };
    }
    if (!wheelId) return { intent, error: "Wheel ID is missing." };
    if (intent === "shuffle-wheel") {
      await shuffleGameWheel(wheelId, input.gameId, input.operator.shop);
      return { intent, wheelId, success: "Wheel order recalibrated." };
    }
    if (intent === "select-duration") {
      const result = await selectGameWheelDuration(
        wheelId,
        input.gameId,
        input.operator.shop,
      );
      return {
        intent,
        wheelId,
        spinDurationSeconds: result.spinDurationSeconds,
        success: `Spin duration locked at ${result.spinDurationSeconds} seconds.`,
      };
    }
    if (intent === "spin-wheel") {
      const result = await startGameWheelSpin(
        wheelId,
        input.gameId,
        input.operator.shop,
      );
      return {
        intent,
        wheelId,
        winnerEntryIndex: result.winnerEntryIndex,
        winnerDisplayName: result.winnerDisplayName ?? undefined,
        winnerValue: result.winnerValue ?? undefined,
        spinDurationSeconds: result.spinDurationSeconds,
        spinToken: result.spinToken,
        success: `${result.wheelLabel} containment cycle engaged.`,
      };
    }
    if (intent === "complete-wheel") {
      const result = await completeGameWheelSpin(
        wheelId,
        input.gameId,
        input.operator.shop,
      );
      return {
        intent,
        wheelId,
        winnerDisplayName: result.winnerDisplayName ?? undefined,
        winnerValue: result.winnerValue ?? undefined,
        secondChance: result.secondChance,
        success: "Containment result saved.",
      };
    }
    if (intent === "accept-result") {
      await acceptGameWheelResult(wheelId, input.gameId, input.operator.shop);
      return { intent, wheelId, success: "Persisted result accepted." };
    }
    if (intent === "create-prize-claim") {
      if (!input.admin)
        throw new Error("Shopify access requires reauthorization.");
      const expirationDays = Number(formData.get("expirationDays"));
      if (
        !PRIZE_CLAIM_EXPIRATION_DAYS.includes(
          expirationDays as PrizeClaimExpirationDays,
        )
      )
        return { intent, wheelId, error: "Select a valid expiration period." };
      const validation = validateAdminPrizePackageOptions(
        formData.get("prizeOptionsJson"),
      );
      if ("error" in validation)
        return { intent, wheelId, error: validation.error };
      const options = await verifyPrizeOptionCollections(
        input.admin,
        validation.options,
      );
      const result = await createWinnerPrizeClaim({
        shop: input.operator.shop,
        gameId: input.gameId,
        gameWheelId: wheelId,
        expirationDays: expirationDays as PrizeClaimExpirationDays,
        prizeOptions: options,
      });
      if (!result.created)
        return {
          intent,
          wheelId,
          success: "An active claim link already exists for this winner.",
        };
      return data<WheelActionData>(
        {
          intent,
          wheelId,
          success: "Private prize claim link created.",
          privateUrl: buildPrizeClaimUrl(
            result.token,
            new URL(input.request.url).origin,
          ),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (["revoke-prize-claim", "fulfill-prize-claim"].includes(intent)) {
      const id = String(formData.get("prizeClaimId") ?? "").trim();
      await updatePrizeClaimStatus({
        id,
        shop: input.operator.shop,
        action: intent === "revoke-prize-claim" ? "revoke" : "fulfill",
      });
      return {
        intent,
        wheelId,
        success:
          intent === "revoke-prize-claim"
            ? "Prize claim link revoked."
            : "Prize claim marked fulfilled.",
      };
    }
    return { intent, error: "Unknown Game Mode action." };
  } catch (error) {
    console.error("Game Mode action failed", {
      shop: input.operator.shop,
      gameId: input.gameId,
      intent,
      error,
    });
    if (error instanceof StaleWheelStateError) return {
      intent,
      wheelId: error.wheel.id,
      stale: true,
      error: error.message,
      authoritativeWheel: error.wheel,
    };
    return {
      intent,
      wheelId: wheelId || undefined,
      error:
        error instanceof Error ? error.message : "The Game Mode action failed.",
    };
  }
}
