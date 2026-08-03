import { WheelResultCard } from "./WheelResultCard";
import type { GameResults } from "./types";

type Props = {
  results: GameResults;
  heading?: string;
  action?: React.ReactNode;
};

export function GameResultsSummary({ results, heading = "Game results", action }: Props) {
  return (
    <section className="game-results-summary" id="game-results" aria-labelledby="game-results-heading">
      <header className="game-results-heading">
        <div>
          <p>Permanent containment record</p>
          <strong>Raffle Number: {results.raffleCode}</strong>
          <h2 id="game-results-heading">{heading}</h2>
        </div>
        {action}
      </header>

      {results.rounds.map((round, roundIndex) => (
        <section className="game-results-round" key={`${round.title}-${roundIndex}`}>
          <header><h3>{round.title}</h3><span>{round.status.replace("_", " ")}</span></header>
          <div className="game-results-grid">
            {round.wheels.map((wheel, wheelIndex) => (
              <WheelResultCard key={`${wheel.label}-${wheelIndex}`} result={wheel} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
