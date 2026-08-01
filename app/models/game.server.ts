import type { GameStatus } from "@prisma/client";
import db from "../db.server";

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