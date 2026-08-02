type Props = {
  result: {
    offset: number;
    beforeDisplayName: string | null;
    afterDisplayName: string | null;
  };
};

export function SecondChanceResult({ result }: Props) {
  const display = (name: string | null) => name ?? "No eligible entry";
  return (
    <section className="second-chance-result" aria-labelledby="second-chance-result-heading">
      <header>
        <p>Two free drawing entries</p>
        <h2 id="second-chance-result-heading">SECOND CHANCE ENTRIES</h2>
        <span>Offset: {result.offset} spots</span>
      </header>
      <div className="second-chance-result-grid">
        <article><small>Before Winner</small><strong>{display(result.beforeDisplayName)}</strong><span>{result.beforeDisplayName ? "Free Entry Awarded" : "No eligible Second Chance winner"}</span></article>
        <article><small>After Winner</small><strong>{display(result.afterDisplayName)}</strong><span>{result.afterDisplayName ? "Free Entry Awarded" : "No eligible Second Chance winner"}</span></article>
      </div>
    </section>
  );
}
