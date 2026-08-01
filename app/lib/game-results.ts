import { formatPublicName } from "./public-name.ts";
import type { GameResults } from "../components/results/types";

export function toPublicGameResults(results: GameResults) {
  return {
    completedAt: results.completedAt,
    rounds: results.rounds.map((round) => ({
      title: round.title,
      wheels: round.wheels
        .filter((wheel) => wheel.status === "COMPLETED")
        .map((wheel) => ({
          label: wheel.label,
          type: wheel.type,
          winner: wheel.type === "NAME" && wheel.winner ? formatPublicName(wheel.winner) : wheel.winner,
        })),
    })),
  };
}
