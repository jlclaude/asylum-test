import type { GameStatus } from "@prisma/client";
import db from "../db.server";
import { normalizeDashboardGameCounts } from "../lib/dashboard-game-counts";

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

export async function getGamesForShop(shop: string) {
  return db.game.findMany({
    where: {
      shop,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getDashboardGameCountsForShop(shop: string) {
  const [total, statusGroups] = await Promise.all([
    db.game.count({
      where: { shop },
    }),
    db.game.groupBy({
      by: ["status"],
      where: { shop },
      _count: { _all: true },
    }),
  ]);

  return normalizeDashboardGameCounts(
    total,
    statusGroups.map((group) => ({
      status: group.status,
      count: group._count._all,
    })),
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
    },
    data: {
      status,
    },
  });
}
