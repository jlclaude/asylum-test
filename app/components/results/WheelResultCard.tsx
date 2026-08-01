import type { WheelResult } from "./types";

function formatCompletedAt(value: string | null) {
  if (!value) return "Not completed";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function WheelResultCard({ result }: { result: WheelResult }) {
  return (
    <article className="game-result-card">
      <header>
        <div>
          <p>{result.type === "NAME" ? "Name wheel" : "Value wheel"}</p>
          <h4>{result.label}</h4>
        </div>
        <span className={`game-result-status game-result-status-${result.status.toLowerCase()}`}>
          {result.status.replace("_", " ")}
        </span>
      </header>

      <strong className="game-result-winner">
        {result.status === "COMPLETED" ? result.winner ?? "Saved result unavailable" : "Awaiting containment"}
      </strong>

      <dl>
        <div><dt>Duration</dt><dd>{result.spinDurationSeconds ? `${result.spinDurationSeconds} seconds` : "Not selected"}</dd></div>
        <div><dt>Completed</dt><dd>{formatCompletedAt(result.completedAt)}</dd></div>
        {result.type === "NAME" && result.winningClaimQuantity !== null ? (
          <div><dt>Confirmed quantity</dt><dd>{result.winningClaimQuantity}</dd></div>
        ) : null}
      </dl>
    </article>
  );
}
