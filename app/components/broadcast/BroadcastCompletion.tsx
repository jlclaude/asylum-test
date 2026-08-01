import { GameCompletionCard } from "../results/GameCompletionCard";
import type { GameResults } from "../results/types";

export function BroadcastCompletion({ gameId, gameTitle, results }: {
  gameId: string;
  gameTitle: string;
  results: GameResults;
}) {
  if (!results.completedAt) return null;
  return (
    <div className="broadcast-completion">
      <GameCompletionCard gameTitle={gameTitle} results={results} controlCenterHref={`/app/games/${gameId}`} />
      <a className="game-results-action" href={`/app/games/${gameId}/play#game-results`}>View completed results</a>
    </div>
  );
}
