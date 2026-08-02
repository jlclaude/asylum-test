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
      <a className="game-results-action" href={`/app/games/${gameId}/play#game-results`}>View completed results</a>
    </div>
  );
}
