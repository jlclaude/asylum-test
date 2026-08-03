import type { ClaimStatus } from "@prisma/client";
import db from "../db.server";
import {
  claimNameEditBlockReason,
  replaceClaimDisplayNameInEntries,
  validateClaimDisplayName,
} from "../lib/claim-display-name";
import {
  deserializeWheelEntries,
  serializeWheelEntries,
} from "./game-run.server";

export type CreateClaimInput = {
  gameId: string;
  displayName: string;
  facebookHandle?: string;
  quantity: number;
  comment?: string;
};

export async function createClaim(input: CreateClaimInput) {
  return db.claim.create({
    data: {
      gameId: input.gameId,
      displayName: input.displayName,
      facebookHandle: input.facebookHandle || null,
      quantity: input.quantity,
      comment: input.comment || null,
      status: "PENDING",
      externalPayment: false,
    },
  });
}

export async function createPublicClaim(input: CreateClaimInput) {
  return db.$transaction(async (transaction) => {
    const game = await transaction.game.findUnique({
      where: {
        id: input.gameId,
      },
    });

    if (!game) {
      return {
        success: false as const,
        error: "This game could not be found.",
      };
    }

    if (game.archivedAt) {
      return {
        success: false as const,
        error: "This game is no longer active.",
      };
    }

    if (game.status !== "OPEN") {
      return {
        success: false as const,
        error: "This game is not currently accepting claims.",
      };
    }

    const reserved = await transaction.claim.aggregate({
      where: {
        gameId: game.id,
        status: {
          in: ["PENDING", "CONFIRMED"],
        },
      },
      _sum: {
        quantity: true,
      },
    });

    const reservedQuantity = reserved._sum.quantity ?? 0;
    const remaining = game.totalSpots - reservedQuantity;

    if (input.quantity > remaining) {
      return {
        success: false as const,
        error:
          remaining > 0
            ? `Only ${remaining} spots remain.`
            : "This game is full.",
      };
    }

    const claim = await transaction.claim.create({
      data: {
        gameId: input.gameId,
        displayName: input.displayName,
        facebookHandle: input.facebookHandle || null,
        quantity: input.quantity,
        comment: input.comment || null,
        status: "PENDING",
        externalPayment: false,
      },
    });

    return {
      success: true as const,
      claim,
    };
  });
}

export async function getClaimsForGame(gameId: string) {
  return db.claim.findMany({
    where: {
      gameId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function getPublicClaimsForGame(gameId: string) {
  const claims = await db.claim.findMany({
    where: {
      gameId,
      status: {
        in: ["PENDING", "CONFIRMED"],
      },
    },
    select: {
      id: true,
      displayName: true,
      quantity: true,
      comment: true,
      status: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  return claims.reverse();
}

export async function getClaimForGame(
  claimId: string,
  gameId: string,
) {
  return db.claim.findFirst({
    where: {
      id: claimId,
      gameId,
    },
  });
}

export async function updateClaim(
  claimId: string,
  gameId: string,
  data: {
    status?: ClaimStatus;
    externalPayment?: boolean;
    expiresAt?: Date | null;
  },
) {
  return db.claim.updateMany({
    where: {
      id: claimId,
      gameId,
    },
    data,
  });
}

export async function confirmClaimPayment(
  claimId: string,
  gameId: string,
) {
  return updateClaim(claimId, gameId, {
    status: "CONFIRMED",
    externalPayment: true,
  });
}

export async function cancelClaim(
  claimId: string,
  gameId: string,
) {
  return updateClaim(claimId, gameId, {
    status: "CANCELED",
    externalPayment: false,
  });
}

export async function getClaimTotals(gameId: string) {
  const claims = await db.claim.findMany({
    where: {
      gameId,
    },
    select: {
      quantity: true,
      status: true,
    },
  });

  let pendingQuantity = 0;
  let confirmedQuantity = 0;
  let pendingClaims = 0;
  let confirmedClaims = 0;

  for (const claim of claims) {
    if (claim.status === "PENDING") {
      pendingQuantity += claim.quantity;
      pendingClaims += 1;
    }

    if (claim.status === "CONFIRMED") {
      confirmedQuantity += claim.quantity;
      confirmedClaims += 1;
    }
  }

  return {
    pendingQuantity,
    confirmedQuantity,
    reservedQuantity: pendingQuantity + confirmedQuantity,
    pendingClaims,
    confirmedClaims,
  };
}

export async function getClaimNameEditState(gameId: string, shop: string) {
  const game = await db.game.findFirst({
    where: { id: gameId, shop },
    select: {
      run: {
        select: {
          secondChanceCalculatedAt: true,
          rounds: {
            select: {
              wheels: {
                select: {
                  status: true,
                  winnerEntryIndex: true,
                  winnerDisplayName: true,
                  winnerValue: true,
                  spunAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const wheels = game?.run?.rounds.flatMap((round) => round.wheels) ?? [];
  const blockReason = claimNameEditBlockReason(
    wheels,
    game?.run?.secondChanceCalculatedAt ?? null,
  );
  const secondChanceCalculated = game?.run?.secondChanceCalculatedAt !== null &&
    game?.run?.secondChanceCalculatedAt !== undefined;
  const resultsBegun = Boolean(claimNameEditBlockReason(wheels, null));

  return {
    gameModeStarted: Boolean(game?.run),
    resultsBegun,
    secondChanceCalculated,
    editable: Boolean(game) && !blockReason,
  };
}

type UpdateClaimDisplayNameInput = {
  shop: string;
  gameId: string;
  claimId: string;
  displayName: string;
};

export async function updateClaimDisplayName(input: UpdateClaimDisplayNameInput) {
  const validation = validateClaimDisplayName(input.displayName);
  if ("error" in validation) {
    throw new Error(validation.error);
  }
  const displayName = validation.displayName;

  return db.$transaction(async (transaction) => {
    const game = await transaction.game.findFirst({
      where: { id: input.gameId, shop: input.shop },
      select: {
        id: true,
        run: {
          select: {
            secondChanceCalculatedAt: true,
            rounds: {
              select: {
                wheels: {
                  orderBy: { position: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (!game) throw new Error("Game not found.");

    const claim = await transaction.claim.findFirst({
      where: { id: input.claimId, gameId: game.id },
    });
    if (!claim) throw new Error("Claim not found.");

    const wheels = game.run?.rounds.flatMap((round) => round.wheels) ?? [];
    const blockReason = claimNameEditBlockReason(
      wheels,
      game.run?.secondChanceCalculatedAt ?? null,
    );
    if (blockReason) throw new Error(blockReason);

    let updatedEntryCount = 0;

    for (const wheel of wheels) {
      if (wheel.type !== "NAME") continue;

      const originalEntries = deserializeWheelEntries(wheel.originalEntriesJson);
      const shuffledEntries = deserializeWheelEntries(wheel.shuffledEntriesJson);
      const original = replaceClaimDisplayNameInEntries(
        originalEntries,
        claim.id,
        displayName,
      );
      const shuffled = replaceClaimDisplayNameInEntries(
        shuffledEntries,
        claim.id,
        displayName,
      );

      if (original.entries.length !== originalEntries.length ||
          shuffled.entries.length !== shuffledEntries.length) {
        throw new Error("The saved wheel entry count changed unexpectedly.");
      }

      updatedEntryCount += shuffled.updatedCount;
      if (original.updatedCount > 0 || shuffled.updatedCount > 0) {
        await transaction.gameWheel.update({
          where: { id: wheel.id },
          data: {
            originalEntriesJson: serializeWheelEntries(original.entries),
            shuffledEntriesJson: serializeWheelEntries(shuffled.entries),
          },
        });
      }
    }

    await transaction.claim.update({
      where: { id: claim.id },
      data: { displayName },
    });

    if (process.env.NODE_ENV === "development") {
      console.info("Claim display name corrected", {
        gameId: game.id,
        claimId: claim.id,
        previousName: claim.displayName,
        newName: displayName,
        wheelEntriesUpdated: updatedEntryCount,
      });
    }

    return {
      claimId: claim.id,
      previousName: claim.displayName,
      displayName,
      updatedEntryCount,
    };
  });
}
