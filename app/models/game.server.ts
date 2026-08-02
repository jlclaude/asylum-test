import type { GameStatus } from "@prisma/client";
import db from "../db.server";
import { normalizeDashboardGameCounts } from "../lib/dashboard-game-counts";
import {
  archiveBlockReason,
  deleteConfirmationMatches,
  duplicateGameTitle,
} from "../lib/game-administration";

export type CreateGameInput = {
  shop: string;
  title: string;
  description?: string;
  totalSpots: number;
  pricePerSpot: string;
  wheelCount: number;
  status: GameStatus;
};

export async function createGame(input: CreateGameInput) {
  return db.game.create({
    data: {
      shop: input.shop,
      title: input.title,
      description: input.description || null,
      totalSpots: input.totalSpots,
      pricePerSpot: input.pricePerSpot,
      wheelCount: input.wheelCount,
      status: input.status,
    },
  });
}

type GameListOptions = {
  search?: string;
  status?: GameStatus | "ALL";
  sort?: "newest" | "oldest";
};

export async function getGamesForShop(shop: string, options: GameListOptions = {}) {
  return db.game.findMany({
    where: {
      shop,
      archivedAt: null,
      ...(options.search ? { title: { contains: options.search } } : {}),
      ...(options.status && options.status !== "ALL" ? { status: options.status } : {}),
    },
    orderBy: {
      createdAt: options.sort === "oldest" ? "asc" : "desc",
    },
  });
}

type ArchivedGameListOptions = {
  search?: string;
  status?: GameStatus | "ALL";
  sort?: "newest" | "oldest";
};

export function getArchivedGamesForShop(shop: string, options: ArchivedGameListOptions = {}) {
  return db.game.findMany({
    where: {
      shop,
      archivedAt: { not: null },
      ...(options.search ? { title: { contains: options.search } } : {}),
      ...(options.status && options.status !== "ALL" ? { status: options.status } : {}),
    },
    include: {
      claims: {
        where: { status: "CONFIRMED" },
        select: { quantity: true },
      },
      run: {
        include: {
          rounds: {
            orderBy: { position: "asc" },
            include: {
              wheels: {
                orderBy: { position: "asc" },
                select: {
                  label: true,
                  status: true,
                  winnerDisplayName: true,
                  winnerValue: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { archivedAt: options.sort === "oldest" ? "asc" : "desc" },
  });
}

export async function getDashboardGameCountsForShop(shop: string) {
  const activeWhere = { shop, archivedAt: null };
  const [total, statusGroups, archived] = await Promise.all([
    db.game.count({
      where: activeWhere,
    }),
    db.game.groupBy({
      by: ["status"],
      where: activeWhere,
      _count: { _all: true },
    }),
    db.game.count({ where: { shop, archivedAt: { not: null } } }),
  ]);

  return normalizeDashboardGameCounts(
    total,
    statusGroups.map((group) => ({
      status: group.status,
      count: group._count._all,
    })),
    archived,
  );
}

export async function getGameForShop(id: string, shop: string) {
  return db.game.findFirst({
    where: {
      id,
      shop,
    },
  });
}

export async function getPublicGame(id: string) {
  return db.game.findUnique({
    where: {
      id,
    },
  });
}

export async function updateGameStatus(
  id: string,
  shop: string,
  status: GameStatus,
) {
  return db.game.updateMany({
    where: {
      id,
      shop,
      archivedAt: null,
    },
    data: {
      status,
    },
  });
}

export async function archiveGame(id: string, shop: string) {
  return db.$transaction(async (transaction) => {
    const game = await transaction.game.findFirst({ where: { id, shop } });
    if (!game) throw new Error("Game not found.");
    if (game.archivedAt) return game;
    const spinningWheels = await transaction.gameWheel.count({
      where: {
        status: "SPINNING",
        gameRound: { gameRun: { gameId: id } },
      },
    });
    const blocked = archiveBlockReason(game.status, spinningWheels > 0);
    if (blocked) throw new Error(blocked);
    return transaction.game.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  });
}

export function restoreGame(id: string, shop: string) {
  return db.game.updateMany({
    where: { id, shop, archivedAt: { not: null } },
    data: { archivedAt: null },
  });
}

export async function duplicateGameSetup(id: string, shop: string) {
  return db.$transaction(async (transaction) => {
    const source = await transaction.game.findFirst({ where: { id, shop } });
    if (!source) throw new Error("Game not found.");
    return transaction.game.create({
      data: {
        shop,
        title: duplicateGameTitle(source.title),
        description: source.description,
        totalSpots: source.totalSpots,
        pricePerSpot: source.pricePerSpot,
        wheelCount: source.wheelCount,
        status: "OPEN",
      },
    });
  });
}

export async function permanentlyDeleteGame(
  id: string,
  shop: string,
  confirmation: string,
) {
  return db.$transaction(async (transaction) => {
    const game = await transaction.game.findFirst({ where: { id, shop } });
    if (!game) throw new Error("Game not found.");
    if (!game.archivedAt) throw new Error("Only archived games can be permanently deleted.");
    if (!deleteConfirmationMatches(confirmation, game.title)) {
      throw new Error("Type the exact game title or DELETE to confirm permanent deletion.");
    }
    await transaction.game.delete({ where: { id } });
    return { id: game.id, title: game.title };
  });
}
