import { useEffect, useMemo, useState } from "react";
import { useActionData, useFetcher, useNavigate } from "react-router";
import { GameResultsSummary } from "../results/GameResultsSummary";
import { GameAdministration } from "../games/GameAdministration";
import { GameReadinessPanel } from "../games/GameReadinessPanel";
import { SecondChanceSummary } from "../second-chance/SecondChanceSummary";
import { GamePrizeClaims } from "../prize-claims/GamePrizeClaims";
import { renderGameInstructionVariables } from "../../lib/game-instruction-variables";
import {
  gameControlRoutes,
  type GameControlPermissions,
  type GameControlRouteMode,
} from "../../lib/game-control-routes";
import type { GameControlCenterData } from "../../services/game-control-center.server";
import { updateDesktopActiveGame } from "../../lib/desktop-automation.client";

type ActionData = {
  error?: string;
  success?: string;
  intent?: string;
  claimId?: string;
  wheelId?: string;
  privateUrl?: string;
  readiness?: import("../../lib/game-readiness").GameReadinessReport;
};

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const styles = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  .control-page { min-height:100%; padding:28px; color:#f5f5f5; background:radial-gradient(circle at top right,rgba(155,22,34,.18),transparent 35%),linear-gradient(145deg,#0d0d0f 0%,#171719 52%,#101012 100%); font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  .control-shell { width:min(1220px,100%); margin:0 auto; }
  .control-back { margin-bottom:22px; padding:0; border:0; color:#9a9ba1; background:transparent; cursor:pointer; font:inherit; font-size:14px; font-weight:750; }
  .control-header { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin-bottom:22px; }
  .control-eyebrow { margin:0 0 8px; color:#e44e5e; font-size:12px; font-weight:850; letter-spacing:.15em; text-transform:uppercase; }
  .control-header h1 { margin:0; font-size:clamp(30px,5vw,46px); line-height:1.08; }
  .control-description { max-width:720px; margin:13px 0 0; color:#999aa0; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.6; }
  .control-status { flex:0 0 auto; padding:8px 12px; border-radius:999px; font-size:12px; font-weight:850; letter-spacing:.06em; }
  .control-status-open { border:1px solid #305c40; color:#97e3b0; background:rgba(29,92,51,.25); }
  .control-status-closed { border:1px solid #66562c; color:#e5cc82; background:rgba(105,82,20,.22); }
  .control-status-ready { border:1px solid #5d3b68; color:#dcb4ea; background:rgba(81,40,95,.25); }
  .control-status-in_progress { border:1px solid #6b3540; color:#f5a3ad; background:rgba(108,36,49,.28); }
  .control-status-completed { border:1px solid #45464c; color:#b7b8bd; background:rgba(69,70,76,.22); }
  .control-stats { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; margin-bottom:18px; }
  .control-stat,.control-card { border:1px solid #2b2b2f; border-radius:15px; background:rgba(28,28,31,.94); box-shadow:0 15px 42px rgba(0,0,0,.18); }
  .control-stat { padding:18px; }
  .control-stat-label { margin:0; color:#87888e; font-size:10px; font-weight:850; letter-spacing:.06em; text-transform:uppercase; }
  .control-stat-value { margin:11px 0 5px; font-size:25px; font-weight:850; line-height:1; }
  .control-stat-note { margin:0; color:#66676d; font-size:11px; }
  .control-progress { margin-bottom:18px; padding:17px 19px; border:1px solid #2b2b2f; border-radius:14px; background:rgba(28,28,31,.94); }
  .control-progress-head { display:flex; justify-content:space-between; gap:15px; margin-bottom:10px; font-size:12px; font-weight:750; }
  .control-progress-track { height:10px; overflow:hidden; border-radius:999px; background:#111113; }
  .control-progress-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,#942532,#df4859); }
  .control-message { margin-bottom:18px; padding:13px 15px; border-radius:10px; font-size:13px; }
  .control-message-error { border:1px solid #73313a; color:#ffabb3; background:rgba(106,28,39,.3); }
  .control-message-success { border:1px solid #305c40; color:#a7e8ba; background:rgba(29,92,51,.25); }
  .control-grid { display:flex; flex-direction:column; gap:18px; }
  .readiness-panel { margin-bottom:18px; }
  .readiness-head { display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #35353a;padding-bottom:15px }
  .readiness-head h2 { margin:0;font-size:24px }
  .readiness-head>strong { padding:9px 12px;border:1px solid;font-size:12px;letter-spacing:.12em }
  .readiness-ready { color:#a7e8ba;border-color:#305c40!important;background:rgba(29,92,51,.25) }
  .readiness-required { color:#ffabb3;border-color:#73313a!important;background:rgba(106,28,39,.3) }
  .readiness-unchecked { margin:22px 0;color:#999aa0 }
  .readiness-counts { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:18px 0 }
  .readiness-counts div { padding:12px;border:1px solid #35353a;background:#111113 }
  .readiness-counts dt { color:#87888e;font-size:9px;font-weight:850;text-transform:uppercase }
  .readiness-counts dd { margin:6px 0 0;font-size:18px;font-weight:900 }
  .readiness-groups { display:grid;gap:8px }
  .readiness-groups details { border:1px solid #35353a;background:#111113 }
  .readiness-groups summary { padding:11px 13px;cursor:pointer;font-size:11px;font-weight:900;letter-spacing:.08em }
  .readiness-groups summary span { float:right;color:#87888e }
  .readiness-groups ul { display:grid;gap:1px;margin:0;padding:0;list-style:none }
  .readiness-check { display:grid;grid-template-columns:25px 1fr auto;gap:10px;align-items:start;padding:11px 13px;border-top:1px solid #29292d }
  .readiness-check>span { display:grid;place-items:center;width:22px;height:22px;border:1px solid;border-radius:50%;font-weight:950 }
  .readiness-check strong { font-size:12px }.readiness-check p { margin:4px 0 0;color:#999aa0;font-size:11px;line-height:1.45 }.readiness-check small { color:#6f7076 }.readiness-check>b { font-size:9px;letter-spacing:.07em }
  .readiness-check-pass>span,.readiness-check-pass>b { color:#97e3b0 }.readiness-check-warning>span,.readiness-check-warning>b { color:#e5cc82 }.readiness-check-blocking>span,.readiness-check-blocking>b { color:#ff8996 }
  .readiness-actions { display:flex;flex-wrap:wrap;gap:9px;margin-top:16px }.readiness-repairs { margin-top:18px;padding-top:16px;border-top:1px solid #35353a }.readiness-repairs h3 { margin:0 0 5px;font-size:14px }.readiness-repairs>p { margin:0 0 12px;color:#87888e;font-size:11px }.readiness-repairs form { display:inline-block;margin:0 8px 8px 0 }
  .control-card { padding:22px; }
  .control-section-head { margin-bottom:18px; }
  .control-section-head h2 { margin:0 0 5px; font-size:19px; }
  .control-section-head p { margin:0; color:#77787e; font-size:13px; }
  .control-toolbar { display:flex; gap:11px; margin-bottom:17px; }
  .control-search { flex:1 1 auto; height:43px; padding:0 13px; border:1px solid #39393e; border-radius:10px; outline:none; color:white; background:#111113; font:inherit; }
  .control-search:focus { border-color:#d94b5b; box-shadow:0 0 0 3px rgba(217,75,91,.14); }
  .control-filters { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px; }
  .control-filter { padding:8px 11px; border:1px solid #38383d; border-radius:999px; color:#a8a9ae; background:#202023; cursor:pointer; font:inherit; font-size:12px; font-weight:750; }
  .control-filter-active { border-color:#be3b4a; color:#fff; background:#7f202c; }
  .control-list { display:grid; gap:11px; }
  .control-claim { padding:16px; border:1px solid #35353a; border-radius:12px; background:rgba(12,12,14,.46); }
  .control-claim-top { display:flex; align-items:flex-start; justify-content:space-between; gap:15px; }
  .control-claim-order { display:flex; align-items:flex-start; gap:12px; }
  .control-claim-number { display:grid; place-items:center; min-width:35px; height:35px; border:1px solid #4b2a2f; border-radius:9px; color:#ee7180; background:#27171a; font-size:11px; font-weight:850; }
  .control-claim h3 { margin:0 0 5px; font-size:14px; }
  .control-claim-meta { display:flex; flex-wrap:wrap; gap:5px 12px; margin:0; color:#77787e; font-size:12px; }
  .control-claim-comment { margin:12px 0 0 47px; color:#a5a6ab; font-size:12px; line-height:1.5; }
  .control-badge { padding:5px 8px; border-radius:999px; font-size:10px; font-weight:850; }
  .control-badge-pending { border:1px solid #66562c; color:#e5cc82; background:rgba(105,82,20,.22); }
  .control-badge-confirmed { border:1px solid #305c40; color:#97e3b0; background:rgba(29,92,51,.25); }
  .control-badge-canceled,.control-badge-expired { border:1px solid #5e3035; color:#df8b94; background:rgba(91,37,44,.25); }
  .control-claim-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:13px; }
  .control-name-editor { display:grid; gap:12px; margin-top:14px; padding:14px; border:1px solid #4b2a2f; border-radius:10px; background:#111114; }
  .control-name-editor dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:0; }
  .control-name-editor dt { color:#77787e; font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
  .control-name-editor dd { margin:3px 0 0; color:#dddde2; font-size:12px; }
  .control-name-editor-actions { display:flex; justify-content:flex-end; gap:8px; }
  .control-button { padding:10px 13px; border-radius:9px; cursor:pointer; font:inherit; font-size:12px; font-weight:850; }
  .control-button:disabled { cursor:wait; opacity:.55; }
  .control-button-primary { border:1px solid #ee5464; color:white; background:linear-gradient(180deg,#d94051,#9d2432); }
  .control-button-secondary { border:1px solid #3c3c41; color:#d7d7da; background:#222225; }
  .control-button-warning { border:1px solid #765122; color:#f1cd83; background:#392a16; }
  .control-button-danger { border:1px solid #b53c4b; color:#fff; background:#721f2a; }
  .control-button-full { width:100%; }
  .control-empty { padding:48px 20px; border:1px dashed #3a3a3f; border-radius:12px; color:#77787e; text-align:center; }
  .control-actions { display:grid; gap:10px; }
  .control-payment-status { padding:13px; border:1px solid #3a3a40; border-radius:10px; background:#151517; }
  .control-payment-status p { margin:0 0 5px; color:#898a90; font-size:10px; font-weight:850; letter-spacing:.08em; text-transform:uppercase; }
  .control-payment-status strong { display:block; margin-bottom:10px; }
  .control-copy-status { min-height:19px; margin:11px 0 0; color:#84d49d; font-size:12px; text-align:center; }
  .control-public-link { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:14px; margin-bottom:18px; }
  .control-public-link code { min-width:0; overflow:hidden; color:#d4d4d8; font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
  .control-workflow-section { margin-top:18px; }
  .control-divider { height:1px; margin:21px 0; background:#303034; }
  .control-form { display:grid; gap:13px; }
  .control-field { display:grid; gap:6px; }
  .control-field label { font-size:12px; font-weight:750; }
  .control-field small { color:#8f9096; font-size:11px; line-height:1.45; }
  .control-input,.control-textarea { width:100%; border:1px solid #39393e; border-radius:9px; outline:none; color:white; background:#111113; font:inherit; }
  .control-input { height:42px; padding:0 11px; }
  .control-textarea { min-height:78px; padding:11px; resize:vertical; }
  .control-input:focus,.control-textarea:focus { border-color:#d94b5b; box-shadow:0 0 0 3px rgba(217,75,91,.14); }
  .control-lock-note { padding:13px; border:1px solid #4f4055; border-radius:10px; color:#cbb5d2; background:rgba(64,40,72,.22); font-size:12px; line-height:1.5; }
  .game-administration { margin-top:18px; }
  .game-danger-zone { margin-top:22px; padding:18px; border:2px solid #7a2833; border-radius:12px; background:rgba(90,25,35,.2); }
  .game-danger-zone h3 { margin:0 0 7px; color:#ff929e; }
  .game-danger-zone p { color:#c29ba0; line-height:1.55; }
  .game-danger-zone summary { margin-bottom:14px; cursor:pointer; font-weight:850; }
  @media (max-width:1000px) { .control-stats{grid-template-columns:repeat(3,minmax(0,1fr));}.control-grid{grid-template-columns:1fr;} }
  @media (max-width:700px) { .control-page{padding:18px;}.control-header{align-items:flex-start;flex-direction:column;}.control-stats{grid-template-columns:repeat(2,minmax(0,1fr));}.control-toolbar{flex-direction:column;}.control-public-link{grid-template-columns:1fr}.control-public-link code{white-space:normal;overflow-wrap:anywhere;} }
  @media (max-width:460px) { .control-page{padding:13px;}.control-card{padding:18px;}.control-stats{grid-template-columns:1fr;}.control-claim-top{flex-direction:column;}.control-claim-comment{margin-left:0;} }
`;

type FilterValue = "ALL" | "PENDING" | "CONFIRMED" | "CANCELED";

export function GameControlCenter({
  data,
  routeMode,
  permissions,
}: {
  data: GameControlCenterData;
  routeMode: GameControlRouteMode;
  permissions: GameControlPermissions;
}) {
  const actionData = useActionData<ActionData>();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const nameFetcher = useFetcher<ActionData>();
  const {
    game,
    claims,
    totals,
    publicUrl,
    results,
    paymentInstructionsConfigured,
    duplicated,
    secondChance,
    nameEditState,
    eligiblePrizeWheels,
    prizeClaims,
    csrfToken,
  } = data;
  const routes = gameControlRoutes(routeMode, game.id, csrfToken);
  useEffect(() => {
    if (routeMode !== "HOST_PORTAL" || !csrfToken) return;
    const origin = window.location.origin;
    updateDesktopActiveGame({
      activeGameId: game.id,
      activeRaffleCode: game.raffleCode,
      activeGameTitle: game.title,
      hostCsrfToken: csrfToken,
      broadcastUrl: `${origin}/host/games/${encodeURIComponent(game.id)}/broadcast`,
      publicClaimUrl: publicUrl,
      facebookPost: `${game.title} · ${game.raffleCode}`,
    });
  }, [csrfToken, game.id, game.raffleCode, game.title, publicUrl, routeMode]);
  const csrfField = csrfToken ? (
    <input type="hidden" name="csrfToken" value={csrfToken} />
  ) : null;

  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);

  const isSubmitting = fetcher.state !== "idle";
  const isSavingName = nameFetcher.state !== "idle";
  const claimsLocked = ["READY", "IN_PROGRESS", "COMPLETED"].includes(
    game.status,
  );
  const remaining = Math.max(game.totalSpots - totals.reservedQuantity, 0);
  const claimed = totals.reservedQuantity;
  const percentage =
    game.totalSpots > 0
      ? Math.min(Math.round((claimed / game.totalSpots) * 100), 100)
      : 0;
  const confirmedRevenue = totals.confirmedQuantity * Number(game.pricePerSpot);

  useEffect(() => {
    if (
      nameFetcher.data?.intent === "edit-claim-name" &&
      nameFetcher.data.success
    ) {
      setEditingClaimId(null);
    }
  }, [nameFetcher.data]);

  const claimNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    claims.forEach((claim, index) => numbers.set(claim.id, index + 1));
    return numbers;
  }, [claims]);

  const filteredClaims = useMemo(() => {
    const term = search.trim().toLowerCase();
    return claims.filter((claim) => {
      const matchesFilter = filter === "ALL" || claim.status === filter;
      const matchesSearch =
        !term ||
        claim.displayName.toLowerCase().includes(term) ||
        claim.facebookHandle?.toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [claims, filter, search]);

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this public claim link:", publicUrl);
    }
  }

  const wheelButtonLabel =
    game.status === "COMPLETED"
      ? "View Wheel Results"
      : game.status === "IN_PROGRESS"
        ? "Return to Live Wheels"
        : game.status === "READY"
          ? "Open Game Wheels"
          : "Begin Game / Open Wheels";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <main className="control-page">
        <div className="control-shell">
          <button
            className="control-back"
            type="button"
            onClick={() => navigate(routes.dashboard)}
          >
            ← Back to dashboard
          </button>

          <header className="control-header">
            <div>
              <p className="control-eyebrow">Game control center</p>
              <strong>{game.raffleCode}</strong>
              <h1>{game.title}</h1>
              <p className="control-description">
                {game.description
                  ? renderGameInstructionVariables(game.description, {
                      secondChanceNumber: game.secondChanceOffset,
                    })
                  : "Manage claims, payments, availability, and public access."}
              </p>
            </div>
            <span
              className={[
                "control-status",
                `control-status-${game.status.toLowerCase()}`,
              ].join(" ")}
            >
              {game.status.replace("_", " ")}
            </span>
          </header>

          <section className="control-stats">
            <article className="control-stat">
              <p className="control-stat-label">Total spots</p>
              <p className="control-stat-value">{game.totalSpots}</p>
              <p className="control-stat-note">
                {formatCurrency(game.pricePerSpot)} each
              </p>
            </article>
            <article className="control-stat">
              <p className="control-stat-label">Claimed</p>
              <p className="control-stat-value">{claimed}</p>
              <p className="control-stat-note">Pending and paid</p>
            </article>
            <article className="control-stat">
              <p className="control-stat-label">Remaining</p>
              <p className="control-stat-value">{remaining}</p>
              <p className="control-stat-note">Available spots</p>
            </article>
            <article className="control-stat">
              <p className="control-stat-label">Pending</p>
              <p className="control-stat-value">{totals.pendingQuantity}</p>
              <p className="control-stat-note">{totals.pendingClaims} claims</p>
            </article>
            <article className="control-stat">
              <p className="control-stat-label">Confirmed</p>
              <p className="control-stat-value">{totals.confirmedQuantity}</p>
              <p className="control-stat-note">
                {formatCurrency(confirmedRevenue)} received
              </p>
            </article>
            <article className="control-stat">
              <p className="control-stat-label">Wheels</p>
              <p className="control-stat-value">{game.wheelCount + 1}</p>
              <p className="control-stat-note">
                {game.wheelCount} name + 1 value
              </p>
            </article>
          </section>

          <section className="control-progress">
            <div className="control-progress-head">
              <span>Game progress</span>
              <span>
                {claimed} / {game.totalSpots} · {percentage}%
              </span>
            </div>
            <div className="control-progress-track">
              <div
                className="control-progress-fill"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </section>

          {game.archivedAt ? (
            <div className="control-message control-message-error">
              Archived {formatDate(game.archivedAt)}. Gameplay and standard
              claim changes are disabled until restored.
            </div>
          ) : null}
          {duplicated ? (
            <div className="control-message control-message-success">
              Game duplicated as {game.raffleCode}. This new copy is OPEN and
              contains setup only.
            </div>
          ) : null}
          {actionData?.error ? (
            <div className="control-message control-message-error">
              {actionData.error}
            </div>
          ) : null}
          {actionData?.success ? (
            <div className="control-message control-message-success">
              {actionData.success}
            </div>
          ) : null}

          <section
            className="control-card control-public-link"
            aria-labelledby="public-claim-link-heading"
          >
            <div className="control-section-head">
              <h2 id="public-claim-link-heading">Public Claim Link</h2>
              <p>Share this link with raffle participants.</p>
              <code>{publicUrl}</code>
            </div>
            <button
              className="control-button control-button-primary"
              type="button"
              onClick={copyPublicLink}
            >
              {copied ? "Copied" : "Copy Link"}
            </button>
          </section>

          <GameReadinessPanel
            gameStatus={game.status}
            archived={Boolean(game.archivedAt)}
            externalReport={
              actionData?.readiness ??
              fetcher.data?.readiness ??
              data.readiness ??
              undefined
            }
            csrfToken={csrfToken}
            canManage={permissions.canManageGame}
            canStart={permissions.canStartGame}
          />

          {fetcher.data?.error ? (
            <div className="control-message control-message-error">
              {fetcher.data.error}
            </div>
          ) : null}
          {fetcher.data?.success ? (
            <div className="control-message control-message-success">
              {fetcher.data.success}
            </div>
          ) : null}
          {nameFetcher.data?.error ? (
            <div className="control-message control-message-error">
              {nameFetcher.data.error}
            </div>
          ) : null}
          {nameFetcher.data?.success ? (
            <div className="control-message control-message-success">
              {nameFetcher.data.success}
            </div>
          ) : null}

          <section className="control-grid">
            <section className="control-card control-quick-actions">
              <div className="control-section-head">
                <h2>Quick actions</h2>
                <p>Manage the public game and wheel session.</p>
              </div>
              <div className="control-actions">
                {permissions.canStartGame ? (
                  <fetcher.Form method="post">
                    {csrfField}
                    <button
                      className="control-button control-button-primary control-button-full"
                      type="submit"
                      name="intent"
                      value="open-wheels"
                      disabled={isSubmitting}
                    >
                      {wheelButtonLabel}
                    </button>
                  </fetcher.Form>
                ) : null}
                {permissions.canStartGame && results ? (
                  <fetcher.Form method="post">
                    {csrfField}
                    <button
                      className="control-button control-button-full"
                      type="submit"
                      name="intent"
                      value="open-broadcast"
                      disabled={isSubmitting}
                    >
                      OPEN BROADCAST MODE
                    </button>
                  </fetcher.Form>
                ) : null}
                <button
                  className="control-button control-button-secondary control-button-full"
                  type="button"
                  onClick={copyPublicLink}
                >
                  Copy public claim link
                </button>
                {permissions.canManageTemplates ? (
                  <fetcher.Form className="control-form" method="post">
                    {csrfField}
                    <input
                      type="hidden"
                      name="intent"
                      value="save-game-template"
                    />
                    <div className="control-field">
                      <label htmlFor="setupTemplateName">Template name</label>
                      <input
                        className="control-input"
                        id="setupTemplateName"
                        name="templateName"
                        maxLength={100}
                        required
                        placeholder="Reusable setup name"
                      />
                    </div>
                    <button
                      className="control-button control-button-secondary control-button-full"
                      type="submit"
                      disabled={isSubmitting}
                    >
                      Save Game Setup as Template
                    </button>
                  </fetcher.Form>
                ) : null}

                {game.status === "OPEN" ? (
                  permissions.canManageGame ? (
                    <fetcher.Form method="post">
                      {csrfField}
                      <input type="hidden" name="intent" value="close-game" />
                      <button
                        className="control-button control-button-warning control-button-full"
                        type="submit"
                        disabled={isSubmitting}
                      >
                        Close game
                      </button>
                    </fetcher.Form>
                  ) : null
                ) : game.status === "CLOSED" ? (
                  permissions.canManageGame ? (
                    <fetcher.Form method="post">
                      {csrfField}
                      <input type="hidden" name="intent" value="reopen-game" />
                      <button
                        className="control-button control-button-secondary control-button-full"
                        type="submit"
                        disabled={isSubmitting}
                      >
                        Reopen game
                      </button>
                    </fetcher.Form>
                  ) : null
                ) : null}
              </div>

              <p className="control-copy-status">
                {copied ? "Public link copied." : ""}
              </p>
            </section>

            <article className="control-card">
              <div className="control-section-head">
                <h2>Claim queue</h2>
                <p>Claims remain ordered by submission time.</p>
              </div>
              <div className="control-toolbar">
                <input
                  className="control-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or Facebook @username"
                />
              </div>
              <div className="control-filters">
                {[
                  ["ALL", "All"],
                  ["PENDING", "Pending"],
                  ["CONFIRMED", "Paid"],
                  ["CANCELED", "Canceled"],
                ].map(([value, label]) => (
                  <button
                    className={[
                      "control-filter",
                      filter === value ? "control-filter-active" : "",
                    ].join(" ")}
                    key={value}
                    type="button"
                    onClick={() => setFilter(value as FilterValue)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {claimsLocked ? (
                <div className="control-lock-note">
                  Claims are locked because the wheel snapshot has already been
                  created. The wheel entries will not change.
                </div>
              ) : null}
              {!nameEditState.editable ? (
                <div className="control-lock-note">
                  Names are locked because wheel results have begun.
                </div>
              ) : null}
              <div style={{ height: 14 }} />

              {filteredClaims.length === 0 ? (
                <div className="control-empty">No claims match this view.</div>
              ) : (
                <div className="control-list">
                  {filteredClaims.map((claim) => (
                    <div className="control-claim" key={claim.id}>
                      <div className="control-claim-top">
                        <div className="control-claim-order">
                          <span className="control-claim-number">
                            #{claimNumbers.get(claim.id)}
                          </span>
                          <div>
                            <h3>{claim.displayName}</h3>
                            <p className="control-claim-meta">
                              <span>
                                {claim.quantity}{" "}
                                {claim.quantity === 1 ? "spot" : "spots"}
                              </span>
                              {claim.facebookHandle ? (
                                <span>
                                  Facebook @username (optional):{" "}
                                  {claim.facebookHandle}
                                </span>
                              ) : null}
                              <span>{formatDate(claim.createdAt)}</span>
                            </p>
                          </div>
                        </div>
                        <span
                          className={[
                            "control-badge",
                            `control-badge-${claim.status.toLowerCase()}`,
                          ].join(" ")}
                        >
                          {claim.status === "CONFIRMED" ? "PAID" : claim.status}
                        </span>
                      </div>

                      {claim.comment ? (
                        <p className="control-claim-comment">{claim.comment}</p>
                      ) : null}

                      {permissions.canEditClaims &&
                      editingClaimId === claim.id ? (
                        <nameFetcher.Form
                          className="control-name-editor"
                          method="post"
                        >
                          <input
                            type="hidden"
                            name="intent"
                            value="edit-claim-name"
                          />
                          {csrfField}
                          <input
                            type="hidden"
                            name="claimId"
                            value={claim.id}
                          />
                          <dl>
                            <div>
                              <dt>Current display name</dt>
                              <dd>{claim.displayName}</dd>
                            </div>
                            <div>
                              <dt>Confirmed quantity</dt>
                              <dd>
                                {claim.status === "CONFIRMED"
                                  ? claim.quantity
                                  : 0}{" "}
                                spots
                              </dd>
                            </div>
                            <div>
                              <dt>Game Mode started</dt>
                              <dd>
                                {nameEditState.gameModeStarted ? "Yes" : "No"}
                              </dd>
                            </div>
                            <div>
                              <dt>Any wheel spun</dt>
                              <dd>
                                {nameEditState.resultsBegun ? "Yes" : "No"}
                              </dd>
                            </div>
                          </dl>
                          <div className="control-field">
                            <label htmlFor={`claim-name-${claim.id}`}>
                              New display name
                            </label>
                            <input
                              className="control-input"
                              id={`claim-name-${claim.id}`}
                              name="displayName"
                              defaultValue={claim.displayName}
                              maxLength={100}
                              required
                            />
                          </div>
                          <div className="control-name-editor-actions">
                            <button
                              className="control-button control-button-secondary"
                              type="button"
                              onClick={() => setEditingClaimId(null)}
                              disabled={isSavingName}
                            >
                              Cancel
                            </button>
                            <button
                              className="control-button control-button-primary"
                              type="submit"
                              disabled={isSavingName}
                            >
                              {isSavingName ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </nameFetcher.Form>
                      ) : permissions.canEditClaims ? (
                        <div className="control-claim-actions">
                          <button
                            className="control-button control-button-secondary"
                            type="button"
                            onClick={() => setEditingClaimId(claim.id)}
                            disabled={!nameEditState.editable || isSavingName}
                          >
                            Edit Name
                          </button>
                        </div>
                      ) : null}

                      {permissions.canConfirmPayments &&
                      claim.status === "PENDING" &&
                      !claimsLocked ? (
                        <div className="control-claim-actions">
                          <fetcher.Form method="post">
                            {csrfField}
                            <input
                              type="hidden"
                              name="intent"
                              value="cancel-claim"
                            />
                            <input
                              type="hidden"
                              name="claimId"
                              value={claim.id}
                            />
                            <button
                              className="control-button control-button-secondary"
                              type="submit"
                              disabled={isSubmitting}
                            >
                              Cancel
                            </button>
                          </fetcher.Form>
                          <fetcher.Form method="post">
                            {csrfField}
                            <input
                              type="hidden"
                              name="intent"
                              value="confirm-claim"
                            />
                            <input
                              type="hidden"
                              name="claimId"
                              value={claim.id}
                            />
                            <button
                              className="control-button control-button-primary"
                              type="submit"
                              disabled={isSubmitting}
                            >
                              Confirm payment
                            </button>
                          </fetcher.Form>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </article>

            <section className="control-card control-payment-controls">
              <div className="control-section-head">
                <h2>Payment Controls</h2>
                <p>
                  Review payment readiness and enter claims submitted directly
                  in your group.
                </p>
              </div>
              <div className="control-payment-status">
                <p>Payment instructions</p>
                <strong>
                  {paymentInstructionsConfigured
                    ? "Configured"
                    : "Not configured"}
                </strong>
                {permissions.canEditPaymentInstructions ? (
                  <button
                    className="control-button control-button-secondary control-button-full"
                    type="button"
                    onClick={() => navigate(routes.settings)}
                  >
                    Edit Payment Instructions
                  </button>
                ) : null}
              </div>
              <div className="control-divider" />
              <div className="control-section-head">
                <h2>Add Facebook claim</h2>
                <p>Enter claims submitted directly in your group.</p>
              </div>

              {!permissions.canEditClaims ? (
                <div className="control-lock-note">
                  Your role can view claims but cannot add or change them.
                </div>
              ) : claimsLocked ? (
                <div className="control-lock-note">
                  New claims are disabled after Game Mode begins.
                </div>
              ) : (
                <fetcher.Form className="control-form" method="post">
                  {csrfField}
                  <input type="hidden" name="intent" value="create-claim" />
                  <div className="control-field">
                    <label htmlFor="displayName">Facebook display name</label>
                    <input
                      className="control-input"
                      id="displayName"
                      name="displayName"
                      type="text"
                      required
                      disabled={
                        isSubmitting ||
                        game.status !== "OPEN" ||
                        remaining === 0
                      }
                    />
                  </div>
                  <div className="control-field">
                    <label htmlFor="facebookHandle">
                      Facebook @username (optional)
                    </label>
                    <input
                      className="control-input"
                      id="facebookHandle"
                      name="facebookHandle"
                      type="text"
                      placeholder="@username (optional)"
                      disabled={
                        isSubmitting ||
                        game.status !== "OPEN" ||
                        remaining === 0
                      }
                    />
                    <small>
                      Optional. Used only to help identify your Facebook profile
                      if you know it.
                    </small>
                  </div>
                  <div className="control-field">
                    <label htmlFor="quantity">Number of spots</label>
                    <input
                      className="control-input"
                      id="quantity"
                      name="quantity"
                      type="number"
                      min="1"
                      max={remaining}
                      required
                      disabled={
                        isSubmitting ||
                        game.status !== "OPEN" ||
                        remaining === 0
                      }
                    />
                  </div>
                  <div className="control-field">
                    <label htmlFor="comment">Member comment</label>
                    <textarea
                      className="control-textarea"
                      id="comment"
                      name="comment"
                      disabled={
                        isSubmitting ||
                        game.status !== "OPEN" ||
                        remaining === 0
                      }
                    />
                  </div>
                  <button
                    className="control-button control-button-primary control-button-full"
                    type="submit"
                    disabled={
                      isSubmitting || game.status !== "OPEN" || remaining === 0
                    }
                  >
                    {isSubmitting
                      ? "Saving…"
                      : game.status !== "OPEN"
                        ? "Game closed"
                        : remaining === 0
                          ? "Game full"
                          : "Add pending claim"}
                  </button>
                </fetcher.Form>
              )}
            </section>
          </section>
          <div className="control-workflow-section">
            <SecondChanceSummary
              offset={game.secondChanceOffset}
              result={secondChance}
            />
          </div>
          {permissions.canExport ? (
            <section
              className="control-card control-workflow-section"
              aria-labelledby="exports-heading"
            >
              <div className="control-section-head">
                <h2 id="exports-heading">Exports</h2>
                <p>Download persisted raffle, claim, and winner records.</p>
              </div>
              <div className="control-actions">
                <a
                  className="control-button control-button-secondary control-button-full"
                  href={routes.exportUrl("raffle-json")}
                >
                  Export Raffle JSON
                </a>
                <a
                  className="control-button control-button-secondary control-button-full"
                  href={routes.exportUrl("claims-csv")}
                >
                  Export Claims CSV
                </a>
                <a
                  className="control-button control-button-secondary control-button-full"
                  href={routes.exportUrl("winners-csv")}
                >
                  Export Winners CSV
                </a>
              </div>
            </section>
          ) : null}
          {permissions.canCreatePrizeClaims ? (
            <GamePrizeClaims
              gameId={game.id}
              eligibleWheels={eligiblePrizeWheels}
              claims={prizeClaims}
              csrfToken={csrfToken}
              routeBase={routes.base}
              routeMode={routeMode}
            />
          ) : null}
          <GameResultsSummary
            results={results}
            secondChance={secondChance}
            storageKey={`asylum:official-record:${game.id}`}
            action={
              results ? (
                <a
                  className="game-results-action"
                  href={`${routes.play}#game-results`}
                >
                  Open Game Results
                </a>
              ) : null
            }
          />
          <GameAdministration
            game={game}
            csrfToken={csrfToken}
            canDuplicate={permissions.canManageGame}
            canArchive={permissions.canArchive}
            canDelete={permissions.canDelete}
          />
        </div>
      </main>
    </>
  );
}
