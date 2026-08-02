import type { SavedSecondChanceResult } from "../../models/second-chance.server";
import { formatOrdinal } from "../../lib/ordinal";

type Props = {
  offset: number;
  result: SavedSecondChanceResult | null;
};

export function SecondChanceSummary({ offset, result }: Props) {
  return (
    <section className="control-card second-chance-summary" aria-labelledby="second-chance-summary-heading">
      <div className="control-section-head">
        <h2 id="second-chance-summary-heading">Second Chance</h2>
        <p>Two free entries are taken from the persisted first name-wheel order.</p>
      </div>
      {!result ? (
        <dl><div><dt>Second Chance offset</dt><dd>{formatOrdinal(offset)}</dd></div><div><dt>Status</dt><dd>Winners pending</dd></div></dl>
      ) : (
        <dl>
          <div><dt>Source wheel</dt><dd>{result.sourceWheelLabel}</dd></div>
          <div><dt>Main winner</dt><dd>{result.mainWinner}</dd></div>
          <div><dt>Offset used</dt><dd>{formatOrdinal(result.offset)} eligible entry</dd></div>
          <div><dt>Before winner</dt><dd>{result.beforeDisplayName ?? "No eligible entry"}</dd></div>
          <div><dt>After winner</dt><dd>{result.afterDisplayName ?? "No eligible entry"}</dd></div>
          <div><dt>Calculated</dt><dd><time dateTime={result.calculatedAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.calculatedAt))}</time></dd></div>
        </dl>
      )}
    </section>
  );
}
