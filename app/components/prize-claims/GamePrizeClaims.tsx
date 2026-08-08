import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";
import type { GameControlRouteMode } from "../../lib/game-control-routes";
import { PrizePackageBuilder } from "./PrizePackageBuilder";

type EligibleWheel = {
  id: string;
  label: string;
  winnerDisplayName: string | null;
  resultAcceptedAt: string | null;
};

type ClaimSummary = {
  id: string;
  gameWheelId: string;
  winnerDisplayName: string;
  wheelLabel: string;
  tokenLastFour: string;
  status: string;
  generatedAt: string;
  expiresAt: string | null;
  submittedAt: string | null;
  fulfilledAt: string | null;
  preferredPrize: string | null;
  selectedPrizeOptionLabel?: string | null;
};

type ActionData = {
  intent?: string;
  wheelId?: string;
  privateUrl?: string;
  error?: string;
  success?: string;
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "None";

export function GamePrizeClaims({
  gameId,
  eligibleWheels,
  claims,
  csrfToken = null,
  routeBase = "/app",
  routeMode,
}: {
  gameId: string;
  eligibleWheels: EligibleWheel[];
  claims: ClaimSummary[];
  csrfToken?: string | null;
  routeBase?: "/app" | "/host";
  routeMode: GameControlRouteMode;
}) {
  const fetcher = useFetcher<ActionData>();
  const [copied, setCopied] = useState(false);
  const storageKey = `asylum:prize-claims:${gameId}`;
  const [expanded, setExpanded] = useState(false);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    setExpanded(sessionStorage.getItem(storageKey) === "expanded");
  }, [storageKey]);
  function toggleExpanded() {
    setExpanded((value) => {
      const next = !value;
      sessionStorage.setItem(storageKey, next ? "expanded" : "collapsed");
      return next;
    });
  }

  async function copyImmediateLink() {
    if (!fetcher.data?.privateUrl) return;
    await navigator.clipboard.writeText(fetcher.data.privateUrl);
    setCopied(true);
  }

  return (
    <section className="prize-game-panel" aria-labelledby="prize-game-heading">
      <button
        className="prize-disclosure"
        type="button"
        aria-expanded={expanded}
        onClick={toggleExpanded}
      >
        <span aria-hidden="true">{expanded ? "▼" : "▶"}</span>
        <span>
          <small>Post-drawing administration</small>
          <strong id="prize-game-heading">Prize Claims</strong>
        </span>
        <b>{claims.length}</b>
      </button>
      {expanded ? (
        <div className="prize-game-content">
          {fetcher.data?.error ? (
            <p className="prize-message prize-error" role="alert">
              {fetcher.data.error}
            </p>
          ) : null}
          {fetcher.data?.success ? (
            <p className="prize-message" role="status">
              {fetcher.data.success}
            </p>
          ) : null}
          {eligibleWheels.length === 0 && claims.length === 0 ? (
            <div className="prize-empty-state">
              <span aria-hidden="true">🏆</span>
              <strong>No Prize Claims Yet</strong>
              <p>
                Winner fulfillment records will appear here after results are
                accepted.
              </p>
            </div>
          ) : null}
          {eligibleWheels.map((wheel) => {
            const saved =
              claims.find(
                (claim) =>
                  claim.gameWheelId === wheel.id &&
                  !["REVOKED", "EXPIRED"].includes(claim.status),
              ) ?? claims.find((claim) => claim.gameWheelId === wheel.id);
            const immediateUrl =
              fetcher.data?.wheelId === wheel.id
                ? fetcher.data.privateUrl
                : null;
            return (
              <article
                className={`prize-game-card prize-status-${(saved?.status ?? "pending").toLowerCase()}${saved?.status === "FULFILLED" ? " prize-game-card-complete" : ""}`}
                key={wheel.id}
              >
                <header className="prize-card-header">
                  <div>
                    <small>Winner</small>
                    <strong>{wheel.winnerDisplayName}</strong>
                    <span>{wheel.label}</span>
                  </div>
                  <span className="prize-status-badge">
                    {saved?.status === "REVIEWED"
                      ? "Reviewed"
                      : saved?.status === "FULFILLED"
                        ? "Fulfilled"
                        : "Pending"}
                  </span>
                </header>
                {saved ? (
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{saved.status}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{formatDate(saved.generatedAt)}</dd>
                    </div>
                    <div>
                      <dt>Expiration</dt>
                      <dd>{formatDate(saved.expiresAt)}</dd>
                    </div>
                    <div>
                      <dt>Submitted</dt>
                      <dd>{formatDate(saved.submittedAt)}</dd>
                    </div>
                    {saved.selectedPrizeOptionLabel || saved.preferredPrize ? (
                      <div>
                        <dt>Prize package</dt>
                        <dd>
                          {saved.selectedPrizeOptionLabel ??
                            saved.preferredPrize}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Last updated</dt>
                      <dd>
                        {formatDate(
                          saved.fulfilledAt ??
                            saved.submittedAt ??
                            saved.generatedAt,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Review status</dt>
                      <dd>
                        {saved.status === "REVIEWED" ||
                        saved.status === "FULFILLED"
                          ? "Reviewed"
                          : "Pending review"}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                {immediateUrl ? (
                  <div className="prize-private-link">
                    <code>{immediateUrl}</code>
                    <button
                      type="button"
                      onClick={() => void copyImmediateLink()}
                    >
                      {copied ? "Copied" : "Copy Claim Link"}
                    </button>
                    <a href={immediateUrl} target="_blank" rel="noreferrer">
                      Open Claim Form
                    </a>
                  </div>
                ) : null}
                {saved && !immediateUrl ? (
                  <p className="prize-link-note">
                    Open Admin Detail to copy an available claim link again.
                    Token ending: {saved.tokenLastFour}
                  </p>
                ) : null}
                <div className="prize-actions">
                  {!saved || ["REVOKED", "EXPIRED"].includes(saved.status) ? (
                    <fetcher.Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="create-prize-claim"
                      />
                      <input type="hidden" name="wheelId" value={wheel.id} />
                      {csrfToken ? (
                        <input
                          type="hidden"
                          name="csrfToken"
                          value={csrfToken}
                        />
                      ) : null}
                      <PrizePackageBuilder routeMode={routeMode} />
                      <label>
                        Expiration
                        <select name="expirationDays" defaultValue="14">
                          <option value="0">No expiration</option>
                          <option value="7">7 days</option>
                          <option value="14">14 days</option>
                          <option value="30">30 days</option>
                        </select>
                      </label>
                      <button disabled={busy}>CREATE PRIVATE CLAIM LINK</button>
                    </fetcher.Form>
                  ) : null}
                  {saved ? (
                    <Link to={`${routeBase}/prize-claims/${saved.id}`}>
                      Open
                    </Link>
                  ) : null}
                  {saved?.status === "SUBMITTED" ? (
                    <Link to={`${routeBase}/prize-claims/${saved.id}`}>
                      Review
                    </Link>
                  ) : null}
                  {saved?.status === "OPEN" ? (
                    <fetcher.Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="revoke-prize-claim"
                      />
                      <input
                        type="hidden"
                        name="prizeClaimId"
                        value={saved.id}
                      />
                      <input type="hidden" name="wheelId" value={wheel.id} />
                      {csrfToken ? (
                        <input
                          type="hidden"
                          name="csrfToken"
                          value={csrfToken}
                        />
                      ) : null}
                      <button disabled={busy}>Revoke Link</button>
                    </fetcher.Form>
                  ) : null}
                  {saved && ["SUBMITTED", "REVIEWED"].includes(saved.status) ? (
                    <fetcher.Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="fulfill-prize-claim"
                      />
                      <input
                        type="hidden"
                        name="prizeClaimId"
                        value={saved.id}
                      />
                      <input type="hidden" name="wheelId" value={wheel.id} />
                      {csrfToken ? (
                        <input
                          type="hidden"
                          name="csrfToken"
                          value={csrfToken}
                        />
                      ) : null}
                      <button disabled={busy}>Fulfilled</button>
                    </fetcher.Form>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
