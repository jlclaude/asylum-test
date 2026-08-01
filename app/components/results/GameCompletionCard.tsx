import { Link } from "react-router";
import type { GameResults } from "./types";

type Props = {
  gameId: string;
  gameTitle: string;
  results: GameResults;
};

export function GameCompletionCard({ gameId, gameTitle, results }: Props) {
  const wheels = results.rounds.flatMap((round) => round.wheels);
  const names = wheels.filter((wheel) => wheel.type === "NAME" && wheel.status === "COMPLETED");
  const value = wheels.find((wheel) => wheel.type === "VALUE" && wheel.status === "COMPLETED");

  return (
    <section className="game-completion-card" aria-labelledby="containment-complete-heading">
      <p>Permanent result verified</p>
      <h2 id="containment-complete-heading">CONTAINMENT COMPLETE</h2>
      <h3>{gameTitle}</h3>
      <dl>
        <div><dt>Completed</dt><dd>{results.completedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(results.completedAt)) : "Saved"}</dd></div>
        <div><dt>Name wheels</dt><dd>{names.length}</dd></div>
        <div><dt>Final value</dt><dd>{value?.winner ?? "—"}</dd></div>
      </dl>
      <ul>
        {names.map((wheel, index) => <li key={`${wheel.label}-${index}`}><span>{wheel.label}</span><strong>{wheel.winner}</strong></li>)}
        {value ? <li><span>{value.label}</span><strong>{value.winner}</strong></li> : null}
      </ul>
      <Link className="game-results-action" to={`/app/games/${gameId}`}>Return to Game Center</Link>
    </section>
  );
}
