import type { ClaimStatus } from "@prisma/client";
import db from "../db.server";

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
      createdAt: "desc",
    },
  });
}

export async function getPublicClaimsForGame(gameId: string) {
  return db.claim.findMany({
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
    hostNotes?: string | null;
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