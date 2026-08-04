import { useFetcher } from "react-router";
import type { GameReadinessReport, ReadinessCheck } from "../../lib/game-readiness";

type ReadinessResponse = {
  error?: string;
  success?: string;
  intent?: string;
  readiness?: GameReadinessReport;
};

type Props = {
  gameStatus: string;
  archived: boolean;
  externalReport?: GameReadinessReport;
};

const categoryOrder = ["GAME", "ARCHIVE", "SECURITY", "RAFFLE", "CLAIMS", "WHEELS", "RESULTS", "RECOVERY", "SECOND_CHANCE", "PAYMENT", "PRIZE_CLAIM", "MUSIC"];

function CheckRow({ item }: { item: ReadinessCheck }) {
  return (
    <li className={`readiness-check readiness-check-${item.severity.toLowerCase()}`}>
      <span aria-hidden="true">{item.severity === "PASS" ? "✓" : item.severity === "WARNING" ? "!" : "×"}</span>
      <div><strong>{item.title}</strong><p>{item.message}</p>{item.affectedId ? <small>Affected record: {item.affectedId}</small> : null}</div>
      <b>{item.severity}</b>
    </li>
  );
}

export function GameReadinessPanel({ gameStatus, archived, externalReport }: Props) {
  const fetcher = useFetcher<ReadinessResponse>();
  const report = fetcher.data?.readiness ?? externalReport;
  const repairs = report?.checks.filter((item) => item.repairIntent).filter((item, index, list) =>
    list.findIndex((candidate) => candidate.repairIntent === item.repairIntent && candidate.affectedId === item.affectedId) === index,
  ) ?? [];
  const grouped = report ? categoryOrder.map((category) => ({
    category,
    checks: report.checks.filter((item) => item.category === category),
  })).filter((group) => group.checks.length > 0) : [];
  const busy = fetcher.state !== "idle";

  return (
    <section className="control-card readiness-panel" aria-labelledby="game-readiness-heading">
      <header className="readiness-head">
        <div><p className="control-eyebrow">Pre-game validation</p><h2 id="game-readiness-heading">GAME READINESS</h2></div>
        {report ? <strong className={report.isReady ? "readiness-ready" : "readiness-required"}>{report.isReady ? "GAME READY" : "ACTION REQUIRED"}</strong> : null}
      </header>

      {!report ? <p className="readiness-unchecked">Readiness has not been checked.</p> : (
        <>
          <dl className="readiness-counts">
            <div><dt>Blocking</dt><dd>{report.blockingCount}</dd></div>
            <div><dt>Warnings</dt><dd>{report.warningCount}</dd></div>
            <div><dt>Passed</dt><dd>{report.passedCount}</dd></div>
            <div><dt>Last checked</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.checkedAt))}</dd></div>
          </dl>
          <div className="readiness-groups">
            {grouped.map((group) => (
              <details key={group.category} open={group.checks.some((item) => item.severity === "BLOCKING")}>
                <summary>{group.category.replace("_", " ")} <span>{group.checks.length}</span></summary>
                <ul>{group.checks.map((item) => <CheckRow key={item.id} item={item} />)}</ul>
              </details>
            ))}
          </div>
        </>
      )}

      {fetcher.data?.error ? <p className="control-message control-message-error" role="alert">{fetcher.data.error}</p> : null}
      {fetcher.data?.success ? <p className="control-message control-message-success" role="status">{fetcher.data.success}</p> : null}

      <div className="readiness-actions">
        <fetcher.Form method="post"><button className="control-button control-button-secondary" type="submit" name="intent" value="run-readiness" disabled={busy}>{report ? "Run Again" : "Run Readiness Check"}</button></fetcher.Form>
        {gameStatus === "CLOSED" ? (
          <fetcher.Form method="post"><button className="control-button control-button-primary" type="submit" name="intent" value="open-wheels" disabled={busy || archived}>{busy ? "Checking…" : "Open Wheels"}</button></fetcher.Form>
        ) : null}
      </div>

      {repairs.length > 0 ? (
        <section className="readiness-repairs" aria-labelledby="safe-recovery-heading">
          <h3 id="safe-recovery-heading">SAFE RECOVERY ACTIONS</h3>
          <p>Each action rechecks current database state and cannot alter a completed winner.</p>
          {repairs.map((repair) => (
            <fetcher.Form method="post" key={`${repair.repairIntent}-${repair.affectedId ?? "game"}`} onSubmit={(event) => {
              if (!window.confirm(`${repair.title}\n\n${repair.message}\n\nRun this state-safe repair?`)) event.preventDefault();
            }}>
              <input type="hidden" name="intent" value="repair-readiness" />
              <input type="hidden" name="repairIntent" value={repair.repairIntent} />
              {repair.affectedId ? <input type="hidden" name="affectedId" value={repair.affectedId} /> : null}
              <button className="control-button control-button-warning" type="submit" disabled={busy}>{repair.title}</button>
            </fetcher.Form>
          ))}
        </section>
      ) : null}
    </section>
  );
}
