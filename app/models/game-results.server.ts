import db from "../db.server";
import { toPublicGameResults } from "../lib/game-results";
import type { GameResults } from "../components/results/types";
import { formatRaffleCode } from "../lib/raffle-number";

export async function getGameResults(gameId: string): Promise<GameResults | null> {
  const run = await db.gameRun.findUnique({
    where: { gameId },
    select: {
      game: { select: { raffleNumber: true } },
      completedAt: true,
      rounds: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          title: true,
          status: true,
          wheels: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              label: true,
              type: true,
              status: true,
              winnerDisplayName: true,
              winnerValue: true,
              spinDurationSeconds: true,
              completedAt: true,
              resultAcceptedAt: true,
              winningClaim: {
                select: { quantity: true },
              },
            },
          },
        },
      },
    },
  });

  if (!run) return null;

  return {
    raffleCode: formatRaffleCode(run.game.raffleNumber),
    completedAt: run.completedAt?.toISOString() ?? null,
    rounds: run.rounds.map((round) => ({
      title: round.title ?? `Round ${round.position}`,
      status: round.status,
      wheels: round.wheels.map((wheel) => ({
        id: wheel.id,
        label: wheel.label,
        type: wheel.type,
        status: wheel.status,
        winner: wheel.winnerDisplayName ?? wheel.winnerValue,
        spinDurationSeconds: wheel.spinDurationSeconds,
        completedAt: wheel.completedAt?.toISOString() ?? null,
        winningClaimQuantity: wheel.winningClaim?.quantity ?? null,
        resultAcceptedAt: wheel.resultAcceptedAt?.toISOString() ?? null,
      })),
    })),
  };
}

export async function getPublicGameResults(gameId: string) {
  const results = await getGameResults(gameId);
  if (!results) return null;

  return toPublicGameResults(results);
}
