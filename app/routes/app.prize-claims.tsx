import type { PrizeClaimStatus } from "@prisma/client";
import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { listPrizeClaims } from "../models/prize-claim.server";
import { authenticate } from "../shopify.server";
import { formatRaffleCode } from "../lib/raffle-number";
import "../styles/prize-claims.css";
const STATUSES = [
  "OPEN",
  "SUBMITTED",
  "REVIEWED",
  "FULFILLED",
  "EXPIRED",
  "REVOKED",
] as const;
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const requested = url.searchParams.get("status") ?? "ALL";
  const status =
    requested === "ALL" ||
    STATUSES.includes(requested as (typeof STATUSES)[number])
      ? (requested as PrizeClaimStatus | "ALL")
      : "ALL";
  const claims = await listPrizeClaims(session.shop, { search, status });
  return {
    search,
    status,
    claims: claims.map((claim) => ({
      id: claim.id,
      gameId: claim.gameId,
      gameTitle: claim.game.title,
      raffleCode: formatRaffleCode(claim.game.raffleNumber),
      archived: Boolean(claim.game.archivedAt),
      winnerDisplayName: claim.winnerDisplayName,
      wheelLabel: claim.wheelLabel,
      preferredPrize: claim.preferredPrize,
      status: claim.status,
      generatedAt: claim.generatedAt.toISOString(),
      submittedAt: claim.submittedAt?.toISOString() ?? null,
      expiresAt: claim.expiresAt?.toISOString() ?? null,
    })),
  };
}
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
export default function PrizeClaimsHistory() {
  const { claims, search, status } = useLoaderData<typeof loader>();
  return (
    <main className="prize-admin-page">
      <div className="prize-admin-shell">
        <Link to="/app">← Dashboard</Link>
        <header>
          <p>Private fulfillment queue</p>
          <h1>Prize Claims</h1>
        </header>
        <Form className="prize-admin-filters" method="get">
          <input
            name="search"
            type="search"
            defaultValue={search}
            placeholder="Search game, winner, or prize"
            aria-label="Search prize claims"
          />
          <select
            name="status"
            defaultValue={status}
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>
            {STATUSES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button>Apply</button>
        </Form>
        <section className="prize-admin-list">
          {claims.length ? (
            claims.map((claim) => (
              <article key={claim.id}>
                <header>
                  <div>
                    <h2>{claim.winnerDisplayName}</h2>
                    <p>
                      {claim.raffleCode} · {claim.gameTitle} · {claim.wheelLabel}
                      {claim.archived ? " · Archived" : ""}
                    </p>
                  </div>
                  <strong>{claim.status}</strong>
                </header>
                <dl>
                  <div>
                    <dt>Preferred prize</dt>
                    <dd>{claim.preferredPrize ?? "Awaiting submission"}</dd>
                  </div>
                  <div>
                    <dt>Generated</dt>
                    <dd>{date(claim.generatedAt)}</dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>{date(claim.submittedAt)}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{date(claim.expiresAt)}</dd>
                  </div>
                </dl>
                <div className="prize-actions">
                  <Link to={`/app/prize-claims/${claim.id}`}>Open Detail</Link>
                  <Link to={`/app/games/${claim.gameId}`}>
                    Game Control Center
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <article>No prize claims match this view.</article>
          )}
        </section>
      </div>
    </main>
  );
}
