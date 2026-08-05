import { formatRaffleCode } from "../lib/raffle-number";
import {
  getClaimNameEditState,
  getClaimsForGame,
  getClaimTotals,
} from "../models/claim.server";
import { getGameResults } from "../models/game-results.server";
import { getGameForShop } from "../models/game.server";
import {
  getEligiblePrizeWheels,
  getPrizeClaimsForGame,
  toPrizeClaimSummary,
} from "../models/prize-claim.server";
import { getSecondChanceResult } from "../models/second-chance.server";
import { getShopSettings } from "../models/shop-settings.server";
import { runGameReadinessCheck } from "./game-readiness.server";

export async function loadGameControlCenter(input: {
  gameId: string | undefined;
  shop: string;
  requestUrl: string;
  csrfToken?: string | null;
  includeReadiness?: boolean;
}) {
  if (!input.gameId)
    throw new Response("Game ID is required.", { status: 400 });
  const game = await getGameForShop(input.gameId, input.shop);
  if (!game) throw new Response("Game not found.", { status: 404 });
  const [
    claims,
    totals,
    results,
    shopSettings,
    secondChance,
    nameEditState,
    eligiblePrizeWheels,
    prizeClaims,
    readiness,
  ] = await Promise.all([
    getClaimsForGame(game.id),
    getClaimTotals(game.id),
    getGameResults(game.id),
    getShopSettings(input.shop),
    getSecondChanceResult(game.id),
    getClaimNameEditState(game.id, input.shop),
    getEligiblePrizeWheels(game.id, input.shop),
    getPrizeClaimsForGame(game.id, input.shop),
    input.includeReadiness
      ? runGameReadinessCheck(game.id, input.shop)
      : Promise.resolve(null),
  ]);
  const requestUrl = new URL(input.requestUrl);
  return {
    csrfToken: input.csrfToken ?? null,
    game: {
      id: game.id,
      raffleCode: formatRaffleCode({
        year: game.raffleYear,
        number: game.raffleNumber,
      }),
      title: game.title,
      description: game.description,
      totalSpots: game.totalSpots,
      pricePerSpot: game.pricePerSpot.toString(),
      wheelCount: game.wheelCount,
      status: game.status,
      archivedAt: game.archivedAt?.toISOString() ?? null,
      secondChanceOffset: game.secondChanceOffset,
      createdAt: game.createdAt.toISOString(),
      updatedAt: game.updatedAt.toISOString(),
    },
    claims: claims.map((claim) => ({
      id: claim.id,
      displayName: claim.displayName,
      facebookHandle: claim.facebookHandle,
      quantity: claim.quantity,
      comment: claim.comment,
      status: claim.status,
      externalPayment: claim.externalPayment,
      createdAt: claim.createdAt.toISOString(),
    })),
    totals,
    results,
    readiness,
    paymentInstructionsConfigured: Boolean(shopSettings?.paymentInstructions),
    publicUrl: `${requestUrl.origin}/games/${game.id}`,
    duplicated: requestUrl.searchParams.get("duplicated") === "1",
    secondChance,
    nameEditState,
    eligiblePrizeWheels: eligiblePrizeWheels.map((wheel) => ({
      ...wheel,
      resultAcceptedAt: wheel.resultAcceptedAt?.toISOString() ?? null,
    })),
    prizeClaims: prizeClaims.map(toPrizeClaimSummary),
  };
}

export type GameControlCenterData = Awaited<
  ReturnType<typeof loadGameControlCenter>
>;
