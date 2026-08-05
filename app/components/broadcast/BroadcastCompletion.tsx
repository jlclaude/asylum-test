import { Link } from "react-router";
import { GameCompletionCard } from "../results/GameCompletionCard";
import type { GameResults } from "../results/types";
import { stopAllWheelMusic } from "../../lib/wheel-music";

export function BroadcastCompletion({
  gameId,
  gameTitle,
  results,
  secondChance,
  routeBase = "/app",
}: {
  gameId: string;
  gameTitle: string;
  results: GameResults;
  secondChance: {
    offset: number;
    beforeDisplayName: string | null;
    afterDisplayName: string | null;
  } | null;
  routeBase?: "/app" | "/host";
}) {
  if (!results.completedAt) return null;
  return (
    <div className="broadcast-completion">
      <GameCompletionCard
        gameId={gameId}
        gameTitle={gameTitle}
        results={results}
        secondChance={secondChance}
        routeBase={routeBase}
      />
      <Link
        className="game-results-action"
        to={`${routeBase}/games/${gameId}#game-results`}
        onClick={stopAllWheelMusic}
      >
        View completed results
      </Link>
    </div>
  );
}
