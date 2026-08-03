import { useState } from "react";
import { Link, useFetcher } from "react-router";
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

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "None";

export function GamePrizeClaims({ eligibleWheels, claims }: { eligibleWheels: EligibleWheel[]; claims: ClaimSummary[] }) {
  const fetcher = useFetcher<ActionData>();
  const [copied, setCopied] = useState(false);
  const busy = fetcher.state !== "idle";

  async function copyImmediateLink() {
    if (!fetcher.data?.privateUrl) return;
    await navigator.clipboard.writeText(fetcher.data.privateUrl);
    setCopied(true);
  }

  if (eligibleWheels.length === 0 && claims.length === 0) return null;

  return (
    <section className="prize-game-panel" aria-labelledby="prize-game-heading">
      <header><p>Private winner fulfillment</p><h2 id="prize-game-heading">PRIZE CLAIM</h2></header>
      {fetcher.data?.error ? <p className="prize-message prize-error" role="alert">{fetcher.data.error}</p> : null}
      {fetcher.data?.success ? <p className="prize-message" role="status">{fetcher.data.success}</p> : null}
      {eligibleWheels.map((wheel) => {
        const saved = claims.find((claim) => claim.gameWheelId === wheel.id && !["REVOKED", "EXPIRED"].includes(claim.status))
          ?? claims.find((claim) => claim.gameWheelId === wheel.id);
        const immediateUrl = fetcher.data?.wheelId === wheel.id ? fetcher.data.privateUrl : null;
        return (
          <article className="prize-game-card" key={wheel.id}>
            <div><small>Winner</small><strong>{wheel.winnerDisplayName}</strong></div>
            <div><small>Source</small><strong>{wheel.label}</strong></div>
            {saved ? (
              <dl>
                <div><dt>Status</dt><dd>{saved.status}</dd></div>
                <div><dt>Generated</dt><dd>{formatDate(saved.generatedAt)}</dd></div>
                <div><dt>Expiration</dt><dd>{formatDate(saved.expiresAt)}</dd></div>
                <div><dt>Submitted</dt><dd>{formatDate(saved.submittedAt)}</dd></div>
                {saved.selectedPrizeOptionLabel || saved.preferredPrize ? <div><dt>Prize package</dt><dd>{saved.selectedPrizeOptionLabel ?? saved.preferredPrize}</dd></div> : null}
              </dl>
            ) : null}
            {immediateUrl ? <div className="prize-private-link"><code>{immediateUrl}</code><button type="button" onClick={() => void copyImmediateLink()}>{copied ? "Copied" : "Copy Claim Link"}</button><a href={immediateUrl} target="_blank" rel="noreferrer">Open Claim Form</a></div> : null}
            {saved && !immediateUrl ? <p className="prize-link-note">Open Admin Detail to copy an available claim link again. Token ending: {saved.tokenLastFour}</p> : null}
            <div className="prize-actions">
              {!saved || ["REVOKED", "EXPIRED"].includes(saved.status) ? (
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="create-prize-claim" />
                  <input type="hidden" name="wheelId" value={wheel.id} />
                  <PrizePackageBuilder />
                  <label>Expiration<select name="expirationDays" defaultValue="14"><option value="0">No expiration</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label>
                  <button disabled={busy}>CREATE PRIVATE CLAIM LINK</button>
                </fetcher.Form>
              ) : null}
              {saved ? <Link to={`/app/prize-claims/${saved.id}`}>Open Admin Detail</Link> : null}
              {saved?.status === "OPEN" ? <fetcher.Form method="post"><input type="hidden" name="intent" value="revoke-prize-claim" /><input type="hidden" name="prizeClaimId" value={saved.id} /><input type="hidden" name="wheelId" value={wheel.id} /><button disabled={busy}>Revoke Link</button></fetcher.Form> : null}
              {saved && ["SUBMITTED", "REVIEWED"].includes(saved.status) ? <fetcher.Form method="post"><input type="hidden" name="intent" value="fulfill-prize-claim" /><input type="hidden" name="prizeClaimId" value={saved.id} /><input type="hidden" name="wheelId" value={wheel.id} /><button disabled={busy}>Mark Fulfilled</button></fetcher.Form> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
