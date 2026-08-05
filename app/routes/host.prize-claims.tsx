import type { PrizeClaimStatus } from "@prisma/client";
import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { requireHostUser } from "../lib/host-auth.server";
import { listPrizeClaims } from "../models/prize-claim.server";
import { formatRaffleCode } from "../lib/raffle-number";
const STATUSES = [
  "OPEN",
  "SUBMITTED",
  "REVIEWED",
  "FULFILLED",
  "EXPIRED",
  "REVOKED",
] as const;
export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostUser(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const value = url.searchParams.get("status") ?? "ALL";
  const status = (
    value === "ALL" || STATUSES.includes(value as (typeof STATUSES)[number])
      ? value
      : "ALL"
  ) as PrizeClaimStatus | "ALL";
  const claims = await listPrizeClaims(host.shop, { search, status });
  return {
    search,
    status,
    claims: claims.map((c) => ({
      id: c.id,
      gameId: c.gameId,
      winner: c.winnerDisplayName,
      wheel: c.wheelLabel,
      status: c.status,
      game: c.game.title,
      raffleCode: formatRaffleCode({
        year: c.game.raffleYear,
        number: c.game.raffleNumber,
      }),
      generatedAt: c.generatedAt.toISOString(),
    })),
  };
}
export default function HostPrizeClaims() {
  const data = useLoaderData<typeof loader>();
  return (
    <>
      <header className="host-header">
        <p className="host-kicker">Private fulfillment queue</p>
        <h1>Prize Claims</h1>
      </header>
      <section className="host-card">
        <Form className="host-form" method="get">
          <label>
            Search
            <input name="search" defaultValue={data.search} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={data.status}>
              <option value="ALL">ALL</option>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button className="host-button">Apply</button>
        </Form>
      </section>
      <section className="host-grid">
        {data.claims.map((claim) => (
          <article className="host-card" key={claim.id}>
            <span className="host-status">{claim.status}</span>
            <h2>{claim.winner}</h2>
            <p>
              {claim.raffleCode} · {claim.game} · {claim.wheel}
            </p>
            <div className="host-actions">
              <Link className="host-link" to={`/host/prize-claims/${claim.id}`}>
                Open Detail
              </Link>
              <Link className="host-link" to={`/host/games/${claim.gameId}`}>
                Game
              </Link>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
