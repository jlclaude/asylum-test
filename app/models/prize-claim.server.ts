import type { PrizeClaimStatus } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import {
  isPrizeClaimExpired,
  prizeClaimExpirationDate,
  validatePrizeClaimSubmission,
  type PrizeClaimExpirationDays,
  type PrizeClaimSubmissionInput,
} from "../lib/prize-claim";
import { buildPrizeClaimUrl, generatePrizeClaimToken, hashPrizeClaimToken } from "../lib/prize-claim-token.server";
import {
  decryptPrizeClaimToken,
  encryptPrizeClaimToken,
} from "../lib/prize-claim-encryption.server";
import { formatRaffleCode, parseRaffleSearch } from "../lib/raffle-number";
import {
  parsePrizePackageOptions,
  parseSelectedBalls,
  parseSelectedPrizeOption,
  isCollectionPrizeOption,
  validateStructuredPrizeSelection,
  type PrizePackageOption,
} from "../lib/prize-packages";
import { resolveSubmittedPrizeProducts } from "../lib/shopify-prize-products.server";

export async function createWinnerPrizeClaim(input: {
  shop: string;
  gameId: string;
  gameWheelId: string;
  expirationDays: PrizeClaimExpirationDays;
  prizeOptions: PrizePackageOption[];
}) {
  return db.$transaction(async (transaction) => {
    const existing = await transaction.prizeClaim.findUnique({
      where: { activeGameWheelId: input.gameWheelId },
    });
    if (existing && !isPrizeClaimExpired(existing.expiresAt)) {
      return { created: false as const, prizeClaim: existing, token: null };
    }
    if (existing) {
      await transaction.prizeClaim.update({
        where: { id: existing.id },
        data: { status: "EXPIRED", activeGameWheelId: null },
      });
    }

    const wheel = await transaction.gameWheel.findFirst({
      where: {
        id: input.gameWheelId,
        gameRound: { gameRun: { gameId: input.gameId, game: { shop: input.shop } } },
      },
      include: { gameRound: { include: { gameRun: { include: { game: true } } } } },
    });
    if (!wheel) throw new Error("Winning wheel not found.");
    if (wheel.type !== "NAME" || wheel.status !== "COMPLETED" ||
        wheel.winnerEntryIndex === null || !wheel.winnerDisplayName || !wheel.resultAcceptedAt) {
      throw new Error("A private claim link requires an accepted, persisted name-wheel winner.");
    }

    const token = generatePrizeClaimToken();
    const prizeClaim = await transaction.prizeClaim.create({
      data: {
        shop: input.shop,
        gameId: wheel.gameRound.gameRun.gameId,
        gameWheelId: wheel.id,
        activeGameWheelId: wheel.id,
        winnerClaimId: wheel.winnerClaimId,
        winnerDisplayName: wheel.winnerDisplayName,
        wheelLabel: wheel.label,
        tokenHash: hashPrizeClaimToken(token),
        tokenLastFour: token.slice(-4),
        encryptedToken: encryptPrizeClaimToken(token),
        expiresAt: prizeClaimExpirationDate(input.expirationDays),
        prizeOptionsJson: JSON.stringify(input.prizeOptions),
      },
    });
    return { created: true as const, prizeClaim, token };
  });
}

export async function getPrizeClaimsForGame(gameId: string, shop: string) {
  await db.prizeClaim.updateMany({
    where: { gameId, shop, status: "OPEN", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED", activeGameWheelId: null },
  });
  return db.prizeClaim.findMany({
    where: { gameId, shop },
    orderBy: { generatedAt: "desc" },
  });
}

export async function getEligiblePrizeWheels(gameId: string, shop: string) {
  return db.gameWheel.findMany({
    where: {
      type: "NAME",
      status: "COMPLETED",
      winnerEntryIndex: { not: null },
      winnerDisplayName: { not: null },
      resultAcceptedAt: { not: null },
      gameRound: { gameRun: { gameId, game: { shop } } },
    },
    orderBy: [{ gameRound: { position: "asc" } }, { position: "asc" }],
    select: { id: true, label: true, winnerDisplayName: true, resultAcceptedAt: true },
  });
}

export async function getPublicPrizeClaim(token: string) {
  if (!token || token.length > 200) return null;
  const claim = await db.prizeClaim.findUnique({
    where: { tokenHash: hashPrizeClaimToken(token) },
    include: { game: { select: { title: true, raffleYear: true, raffleNumber: true } } },
  });
  if (!claim) return null;
  if (claim.status === "OPEN" && isPrizeClaimExpired(claim.expiresAt)) {
    await db.prizeClaim.updateMany({
      where: { id: claim.id, status: "OPEN" },
      data: { status: "EXPIRED", activeGameWheelId: null },
    });
    return { state: "EXPIRED" as const };
  }
  if (claim.status !== "OPEN") return { state: claim.status } as const;
  const prizeOptions = parsePrizePackageOptions(claim.prizeOptionsJson);
  if (claim.prizeOptionsJson && !prizeOptions) return { state: "INVALID_CONFIGURATION" as const };
  return {
    state: "OPEN" as const,
    gameTitle: claim.game.title,
    raffleCode: formatRaffleCode({ year: claim.game.raffleYear, number: claim.game.raffleNumber }),
    winnerDisplayName: claim.winnerDisplayName,
    wheelLabel: claim.wheelLabel,
    expiresAt: claim.expiresAt?.toISOString() ?? null,
    prizeOptions,
    shop: claim.shop,
  };
}

export async function submitPublicPrizeClaim(token: string, formData: FormData, admin?: AdminApiContext) {
  const tokenHash = hashPrizeClaimToken(token);
  return db.$transaction(async (transaction) => {
    const claim = await transaction.prizeClaim.findUnique({
      where: { tokenHash },
      include: { game: { select: { title: true, raffleYear: true, raffleNumber: true } } },
    });
    if (!claim) throw new Error("This prize claim link is invalid.");
    if (isPrizeClaimExpired(claim.expiresAt)) {
      await transaction.prizeClaim.updateMany({
        where: { id: claim.id, status: "OPEN" },
        data: { status: "EXPIRED", activeGameWheelId: null },
      });
      throw new Error("This prize claim link has expired. Contact the host.");
    }
    if (claim.status === "REVOKED") throw new Error("This prize claim link has been revoked. Contact the host.");
    if (claim.status !== "OPEN") throw new Error("This prize request has already been submitted.");

    const options = parsePrizePackageOptions(claim.prizeOptionsJson);
    if (claim.prizeOptionsJson && !options) throw new Error("The prize package configuration is invalid. Contact the host.");
    let input: PrizeClaimSubmissionInput;
    let structuredData: {
      selectedPrizeOptionId: string;
      selectedPrizeOptionLabel: string;
      selectedPrizeOptionJson: string;
      selectedBallsJson: string;
    } | Record<string, never> = {};
    if (options) {
      const selectedIds = formData.getAll("selectedPrizeOptionId");
      if (selectedIds.length !== 1) throw new Error("Select exactly one prize option.");
      const option = options.find((candidate) => candidate.id === String(selectedIds[0]));
      if (!option) throw new Error("Select one of the available prize options.");
      let selectedBallsJson: string;
      if (isCollectionPrizeOption(option)) {
        if (!admin) throw new Error("Shopify product selection is temporarily unavailable. Contact the host.");
        const products = formData.getAll("productId").map(String);
        const weights = formData.getAll("ballWeight").map((value) => String(value));
        selectedBallsJson = JSON.stringify(await resolveSubmittedPrizeProducts(admin, option, products, weights));
      } else {
        const selection = validateStructuredPrizeSelection(formData, options);
        if ("error" in selection) throw new Error(selection.error);
        selectedBallsJson = JSON.stringify(selection.balls);
      }
      const validation = validatePrizeClaimSubmission(formData, option.label);
      if ("error" in validation) throw new Error(validation.error);
      input = validation.input;
      structuredData = {
        selectedPrizeOptionId: option.id,
        selectedPrizeOptionLabel: option.label,
        selectedPrizeOptionJson: JSON.stringify(option),
        selectedBallsJson,
      };
    } else {
      const validation = validatePrizeClaimSubmission(formData);
      if ("error" in validation) throw new Error(validation.error);
      input = validation.input;
    }

    const submittedAt = new Date();
    const update = await transaction.prizeClaim.updateMany({
      where: { id: claim.id, status: "OPEN" },
      data: { ...input, ...structuredData, status: "SUBMITTED", submittedAt },
    });
    if (update.count !== 1) throw new Error("This prize request has already been submitted.");
    return {
      gameTitle: claim.game.title,
      raffleCode: formatRaffleCode({ year: claim.game.raffleYear, number: claim.game.raffleNumber }),
      preferredPrize: input.preferredPrize,
      selectedPrizeOptionLabel: "selectedPrizeOptionLabel" in structuredData ? structuredData.selectedPrizeOptionLabel : null,
      recipientName: input.recipientName,
      submittedAt: submittedAt.toISOString(),
    };
  });
}

export async function listPrizeClaims(shop: string, options: { search?: string; status?: PrizeClaimStatus | "ALL" } = {}) {
  await db.prizeClaim.updateMany({
    where: { shop, status: "OPEN", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED", activeGameWheelId: null },
  });
  const search = options.search?.trim();
  const raffle = search ? parseRaffleSearch(search) : null;
  return db.prizeClaim.findMany({
    where: {
      shop,
      ...(options.status && options.status !== "ALL" ? { status: options.status } : {}),
      ...(search ? { OR: [
        { winnerDisplayName: { contains: search } },
        { preferredPrize: { contains: search } },
        { game: { title: { contains: search } } },
        ...(raffle ? [{ game: { raffleNumber: raffle.number, ...(raffle.year ? { raffleYear: raffle.year } : {}) } }] : []),
      ] } : {}),
    },
    include: { game: { select: { title: true, raffleYear: true, raffleNumber: true, archivedAt: true } } },
    orderBy: { generatedAt: "desc" },
  });
}

export async function getPrizeClaimForShop(id: string, shop: string) {
  await db.prizeClaim.updateMany({
    where: { id, shop, status: "OPEN", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED", activeGameWheelId: null },
  });
  const claim = await db.prizeClaim.findFirst({
    where: { id, shop },
    select: {
      id: true,
      gameId: true,
      winnerDisplayName: true,
      wheelLabel: true,
      status: true,
      tokenLastFour: true,
      encryptedToken: true,
      expiresAt: true,
      generatedAt: true,
      submittedAt: true,
      reviewedAt: true,
      fulfilledAt: true,
      revokedAt: true,
      preferredPrize: true,
      prizeOptionsJson: true,
      selectedPrizeOptionId: true,
      selectedPrizeOptionLabel: true,
      selectedPrizeOptionJson: true,
      selectedBallsJson: true,
      recipientName: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      stateProvince: true,
      postalCode: true,
      country: true,
      winnerNotes: true,
      adminNotes: true,
      createdAt: true,
      updatedAt: true,
      game: {
        select: {
          title: true,
          raffleYear: true,
          raffleNumber: true,
          archivedAt: true,
        },
      },
    },
  });
  if (!claim) return null;
  const { encryptedToken, ...detail } = claim;
  return {
    ...detail,
    hasReusableLink: encryptedToken !== null,
    prizeOptions: parsePrizePackageOptions(detail.prizeOptionsJson),
    selectedBalls: parseSelectedBalls(detail.selectedBallsJson),
    selectedPrizeOption: parseSelectedPrizeOption(detail.selectedPrizeOptionJson),
  };
}

export async function revealPrizeClaimLink(input: {
  id: string;
  shop: string;
  origin: string;
}) {
  const claim = await db.prizeClaim.findFirst({
    where: { id: input.id, shop: input.shop },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      encryptedToken: true,
    },
  });
  if (!claim) throw new Error("Prize claim not found.");

  if (claim.status === "OPEN" && isPrizeClaimExpired(claim.expiresAt)) {
    await db.prizeClaim.updateMany({
      where: { id: claim.id, status: "OPEN" },
      data: { status: "EXPIRED", activeGameWheelId: null },
    });
    return { available: false as const, reason: "Expired" };
  }
  if (claim.status !== "OPEN") {
    const labels = {
      SUBMITTED: "Already submitted",
      REVIEWED: "Already submitted",
      FULFILLED: "Fulfilled",
      EXPIRED: "Expired",
      REVOKED: "Revoked",
    } as const;
    return {
      available: false as const,
      reason: labels[claim.status as keyof typeof labels] ?? "Unavailable",
    };
  }
  if (!claim.encryptedToken) {
    return { available: false as const, reason: "Legacy link" };
  }

  const token = decryptPrizeClaimToken(claim.encryptedToken);
  return {
    available: true as const,
    url: buildPrizeClaimUrl(token, input.origin, input.origin),
  };
}

export function toPrizeClaimSummary(claim: Awaited<ReturnType<typeof getPrizeClaimsForGame>>[number]) {
  return {
    id: claim.id,
    gameWheelId: claim.gameWheelId,
    winnerDisplayName: claim.winnerDisplayName,
    wheelLabel: claim.wheelLabel,
    tokenLastFour: claim.tokenLastFour,
    status: claim.status,
    generatedAt: claim.generatedAt.toISOString(),
    expiresAt: claim.expiresAt?.toISOString() ?? null,
    submittedAt: claim.submittedAt?.toISOString() ?? null,
    fulfilledAt: claim.fulfilledAt?.toISOString() ?? null,
    preferredPrize: claim.preferredPrize,
    selectedPrizeOptionLabel: claim.selectedPrizeOptionLabel,
  };
}

export async function updatePrizeClaimStatus(input: {
  id: string;
  shop: string;
  action: "review" | "fulfill" | "revoke";
  confirmSubmittedRevocation?: boolean;
  adminNotes?: string;
}) {
  if (input.adminNotes && (input.adminNotes.length > 2000 || [...input.adminNotes].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 10 && code !== 13) || code === 127;
  }))) throw new Error("Admin notes must be 2,000 characters or fewer and contain no control characters.");
  return db.$transaction(async (transaction) => {
    const claim = await transaction.prizeClaim.findFirst({ where: { id: input.id, shop: input.shop } });
    if (!claim) throw new Error("Prize claim not found.");
    if (claim.status === "FULFILLED") return claim;
    if (input.action === "review") {
      if (claim.status !== "SUBMITTED") throw new Error("Only submitted prize claims can be marked reviewed.");
      return transaction.prizeClaim.update({ where: { id: claim.id }, data: { status: "REVIEWED", reviewedAt: new Date(), adminNotes: input.adminNotes ?? claim.adminNotes } });
    }
    if (input.action === "fulfill") {
      if (claim.status !== "SUBMITTED" && claim.status !== "REVIEWED") throw new Error("Only submitted or reviewed prize claims can be fulfilled.");
      return transaction.prizeClaim.update({ where: { id: claim.id }, data: { status: "FULFILLED", fulfilledAt: claim.fulfilledAt ?? new Date(), adminNotes: input.adminNotes ?? claim.adminNotes } });
    }
    if (claim.status === "SUBMITTED" && !input.confirmSubmittedRevocation) {
      throw new Error("Confirm revocation of this submitted prize request.");
    }
    if (claim.status !== "OPEN" && claim.status !== "SUBMITTED") throw new Error("This prize claim cannot be revoked.");
    return transaction.prizeClaim.update({ where: { id: claim.id }, data: { status: "REVOKED", revokedAt: new Date(), activeGameWheelId: null, adminNotes: input.adminNotes ?? claim.adminNotes } });
  });
}
