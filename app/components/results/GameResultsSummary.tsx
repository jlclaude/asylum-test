import { useEffect, useState } from "react";
import { WheelResultCard } from "./WheelResultCard";
import type { GameResults } from "./types";

type Props = {
  results: GameResults | null;
  heading?: string;
  action?: React.ReactNode;
  storageKey?: string;
  secondChance?: {
    sourceWheelId: string;
    beforeDisplayName: string | null;
    afterDisplayName: string | null;
  } | null;
};

export function GameResultsSummary({
  results,
  heading = "Official Raffle Record",
  action,
  storageKey,
  secondChance = null,
}: Props) {
  const collapsible = Boolean(storageKey);
  const [expanded, setExpanded] = useState(!collapsible);
  useEffect(() => {
    if (storageKey)
      setExpanded(sessionStorage.getItem(storageKey) === "expanded");
  }, [storageKey]);
  function toggleExpanded() {
    setExpanded((value) => {
      const next = !value;
      if (storageKey)
        sessionStorage.setItem(storageKey, next ? "expanded" : "collapsed");
      return next;
    });
  }
  const completed =
    results?.rounds
      .flatMap((round) => round.wheels)
      .filter((wheel) => wheel.status === "COMPLETED") ?? [];
  return (
    <section
      className="game-results-summary"
      id="game-results"
      aria-labelledby="game-results-heading"
    >
      <button
        className="record-disclosure"
        type="button"
        aria-expanded={expanded}
        onClick={toggleExpanded}
        disabled={!collapsible}
      >
        <span aria-hidden="true">{expanded ? "▼" : "▶"}</span>
        <span>
          <small>Archived drawing results</small>
          <strong id="game-results-heading">{heading}</strong>
        </span>
        <b>{results?.raffleCode ?? "No record"}</b>
      </button>
      {expanded ? (
        <div className="official-record-content">
          <div className="official-record-toolbar">
            {results ? (
              <strong>Raffle Number: {results.raffleCode}</strong>
            ) : (
              <strong>Awaiting results</strong>
            )}
            {action}
          </div>
          {completed.length === 0 ? (
            <div className="record-empty-state">
              <span aria-hidden="true">🏆</span>
              <strong>No Wheels Completed Yet</strong>
              <p>
                Completed wheel results will be archived here automatically.
              </p>
            </div>
          ) : (
            <div className="official-record-grid">
              {completed.map((wheel, index) => (
                <WheelResultCard
                  key={`${wheel.label}-${index}`}
                  result={wheel}
                  secondChance={
                    wheel.id && wheel.id === secondChance?.sourceWheelId
                      ? secondChance
                      : null
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
