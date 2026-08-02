import { Link } from "react-router";
import { GameCompletionCard } from "../results/GameCompletionCard";
import type { GameResults } from "../results/types";

export function BroadcastCompletion({ gameId, gameTitle, results, secondChance }: {
  gameId: string;
  gameTitle: string;
  results: GameResults;
  secondChance: {
    offset: number;
    beforeDisplayName: string | null;
    afterDisplayName: string | null;
  } | null;
}) {
  if (!results.completedAt) return null;
  return (
    <div className="broadcast-completion">
      <GameCompletionCard gameId={gameId} gameTitle={gameTitle} results={results} secondChance={secondChance} />
      <Link className="game-results-action" to={`/app/games/${gameId}#game-results`}>View completed results</Link>
    </div>
  );
}
