type PublicResults = {
  raffleCode: string;
  completedAt: string | null;
  rounds: Array<{
    title: string;
    wheels: Array<{ label: string; type: "NAME" | "VALUE"; winner: string | null }>;
  }>;
};

export function PublicGameResults({ gameTitle, results }: { gameTitle: string; results: PublicResults }) {
  return (
    <section className="public-results" aria-labelledby="public-results-heading">
      <p>Official saved results</p>
      <h2 id="public-results-heading">CONTAINMENT COMPLETE</h2>
      <strong>Raffle Number: {results.raffleCode}</strong>
      <h3>{gameTitle}</h3>
      {results.completedAt ? <time dateTime={results.completedAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(new Date(results.completedAt))}</time> : null}

      {results.rounds.map((round, roundIndex) => (
        <section key={`${round.title}-${roundIndex}`}>
          <h4>{round.title}</h4>
          <ul>
            {round.wheels.map((wheel, wheelIndex) => (
              <li key={`${wheel.label}-${wheelIndex}`}>
                <span>{wheel.label}<small>{wheel.type === "NAME" ? "Selected member" : "Final value"}</small></span>
                <strong>{wheel.winner ?? "Result unavailable"}</strong>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
