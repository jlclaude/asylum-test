import type { WheelResult } from "./types";

function formatCompletedAt(value: string | null) {
  if (!value) return "Not completed";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function WheelResultCard({
  result,
  secondChance = null,
}: {
  result: WheelResult;
  secondChance?: {
    beforeDisplayName: string | null;
    afterDisplayName: string | null;
  } | null;
}) {
  return (
    <article className="game-result-card">
      <header>
        <div>
          <p>
            {result.type === "NAME" ? "Containment wheel" : "Reward Chamber"}
          </p>
          <h4>{result.label}</h4>
        </div>
        <span
          className={`game-result-status game-result-status-${result.status.toLowerCase()}`}
        >
          {result.status.replace("_", " ")}
        </span>
      </header>

      <strong className="game-result-winner">
        <small>🏆 Winner</small>
        {result.status === "COMPLETED"
          ? (result.winner ?? "Saved result unavailable")
          : "Awaiting containment"}
      </strong>

      <dl className="official-record-details">
        {secondChance ? (
          <div>
            <dt>🎟️ Second Chance</dt>
            <dd>
              {[secondChance.beforeDisplayName, secondChance.afterDisplayName]
                .filter(Boolean)
                .join(" · ") || "None"}
            </dd>
          </div>
        ) : null}
        {result.type === "VALUE" ? (
          <div>
            <dt>🎁 Reward Chamber</dt>
            <dd>{result.winner ?? "Saved result unavailable"}</dd>
          </div>
        ) : null}
        <div>
          <dt>📅 Completed</dt>
          <dd>{formatCompletedAt(result.completedAt)}</dd>
        </div>
        {result.type === "NAME" && result.winningClaimQuantity !== null ? (
          <div>
            <dt>Confirmed quantity</dt>
            <dd>{result.winningClaimQuantity}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
