import { Link } from "react-router";
import type { GameResults } from "./types";
import { formatOrdinal } from "../../lib/ordinal";
import { stopAllWheelMusic } from "../../lib/wheel-music";

type Props = {
  gameId: string;
  gameTitle: string;
  results: GameResults;
  secondChance?: {
    offset: number;
    beforeDisplayName: string | null;
    afterDisplayName: string | null;
  } | null;
};

export function GameCompletionCard({ gameId, gameTitle, results, secondChance = null }: Props) {
  const wheels = results.rounds.flatMap((round) => round.wheels);
  const names = wheels.filter((wheel) => wheel.type === "NAME" && wheel.status === "COMPLETED");
  const value = wheels.find((wheel) => wheel.type === "VALUE" && wheel.status === "COMPLETED");

  return (
    <section className="game-completion-card" aria-labelledby="containment-complete-heading">
      <p>Permanent result verified</p>
      <h2 id="containment-complete-heading">CONTAINMENT COMPLETE</h2>
      <strong>Raffle Number: {results.raffleCode}</strong>
      <h3>{gameTitle}</h3>
      <dl>
        <div><dt>Completed</dt><dd>{results.completedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(results.completedAt)) : "Saved"}</dd></div>
        <div><dt>Containment wheels</dt><dd>{names.length}</dd></div>
        <div><dt>Final value</dt><dd>{value?.winner ?? "—"}</dd></div>
      </dl>
      <ul>
        {names.map((wheel, index) => <li key={`${wheel.label}-${index}`}><span>{wheel.label}</span><strong>{wheel.winner}</strong></li>)}
        {value ? <li><span>{value.label}</span><strong>{value.winner}</strong></li> : null}
      </ul>
      {secondChance ? (
        <section className="game-completion-second-chance" aria-labelledby="completion-second-chance-heading">
          <p>Two persisted drawing entries</p>
          <h3 id="completion-second-chance-heading">SECOND CHANCE FREE ENTRIES</h3>
          <dl>
            <div><dt>Offset used</dt><dd>{formatOrdinal(secondChance.offset)} eligible entry</dd></div>
          </dl>
          <div className="game-completion-second-chance-grid">
            <article>
              <small>Above Winner</small>
              <strong>{secondChance.beforeDisplayName ?? "No eligible winner"}</strong>
              <span>{secondChance.beforeDisplayName ? "FREE ENTRY AWARDED" : "NOT AWARDED"}</span>
            </article>
            <article>
              <small>Below Winner</small>
              <strong>{secondChance.afterDisplayName ?? "No eligible winner"}</strong>
              <span>{secondChance.afterDisplayName ? "FREE ENTRY AWARDED" : "NOT AWARDED"}</span>
            </article>
          </div>
        </section>
      ) : null}
      <Link className="game-results-action" to={`/app/games/${gameId}`} onClick={stopAllWheelMusic}>Return to Game Center</Link>
    </section>
  );
}
