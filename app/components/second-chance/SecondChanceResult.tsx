import { formatOrdinal } from "../../lib/ordinal";

type Props = {
  result: {
    offset: number;
    beforeDisplayName: string | null;
    afterDisplayName: string | null;
  };
};

export function SecondChanceResult({ result }: Props) {
  const display = (name: string | null) => name ?? "No eligible entry";
  const ordinal = formatOrdinal(result.offset);
  return (
    <section className="second-chance-result" aria-labelledby="second-chance-result-heading">
      <header>
        <p>Two free drawing entries</p>
        <h2 id="second-chance-result-heading">SECOND CHANCE FREE ENTRIES</h2>
      </header>
      <div className="second-chance-result-grid">
        <article><small>{ordinal} eligible entry above</small><strong>{display(result.beforeDisplayName)}</strong><span>{result.beforeDisplayName ? "FREE ENTRY AWARDED" : "NOT AWARDED"}</span></article>
        <article><small>{ordinal} eligible entry below</small><strong>{display(result.afterDisplayName)}</strong><span>{result.afterDisplayName ? "FREE ENTRY AWARDED" : "NOT AWARDED"}</span></article>
      </div>
    </section>
  );
}
