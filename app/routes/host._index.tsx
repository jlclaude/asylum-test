import type { GameStatus } from "@prisma/client";
import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useOutletContext } from "react-router";
import { requireHostUser } from "../lib/host-auth.server";
import {
  getDashboardGameCountsForShop,
  getGamesForShop,
} from "../models/game.server";
import { formatRaffleCode } from "../lib/raffle-number";

export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostUser(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const requested = url.searchParams.get("status") ?? "ALL";
  const status = (
    ["OPEN", "CLOSED", "READY", "IN_PROGRESS", "COMPLETED"].includes(requested)
      ? requested
      : "ALL"
  ) as GameStatus | "ALL";
  const [games, counts] = await Promise.all([
    getGamesForShop(host.shop, { search, status }),
    getDashboardGameCountsForShop(host.shop),
  ]);
  return {
    search,
    status,
    counts,
    games: games.map((game) => ({
      id: game.id,
      title: game.title,
      raffleCode: formatRaffleCode({
        year: game.raffleYear,
        number: game.raffleNumber,
      }),
      status: game.status,
      totalSpots: game.totalSpots,
      createdAt: game.createdAt.toISOString(),
    })),
  };
}
export default function HostDashboard() {
  const data = useLoaderData<typeof loader>();
  const { user } = useOutletContext<{ user: { permissions: string[] } }>();
  return (
    <>
      <header className="host-header">
        <p className="host-kicker">Operator Control Center</p>
        <h1>Host Dashboard</h1>
        <p>
          Shop-isolated persisted game state. Wheel outcomes and claims are
          shared with the Shopify Admin app.
        </p>
      </header>
      <section className="host-grid" aria-label="Game totals">
        {Object.entries(data.counts).map(([label, count]) => (
          <article className="host-card" key={label}>
            <h2>{String(count)}</h2>
            <p>{label.replace(/([A-Z])/g, " $1")}</p>
          </article>
        ))}
      </section>
      <section className="host-card">
        <div className="host-actions">
          {user.permissions.includes("games:create") ? (
            <Link className="host-button" to="/host/games/new">
              Create Game
            </Link>
          ) : null}
          <Link className="host-link" to="/host/games/archived">
            Archived Games
          </Link>
        </div>
        <Form className="host-form" method="get">
          <label>
            Search
            <input type="search" name="search" defaultValue={data.search} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={data.status}>
              <option value="ALL">All</option>
              {["OPEN", "CLOSED", "READY", "IN_PROGRESS", "COMPLETED"].map(
                (status) => (
                  <option key={status}>{status}</option>
                ),
              )}
            </select>
          </label>
          <button className="host-button">Apply filters</button>
        </Form>
      </section>
      <section className="host-grid">
        {data.games.map((game) => (
          <article className="host-card" key={game.id}>
            <span className="host-status">{game.status}</span>
            <h2>
              {game.raffleCode} · {game.title}
            </h2>
            <p>{game.totalSpots} spots</p>
            <Link className="host-link" to={`/host/games/${game.id}`}>
              Open Game Control Center
            </Link>
          </article>
        ))}
        {!data.games.length ? (
          <p className="host-empty">No games match this view.</p>
        ) : null}
      </section>
    </>
  );
}
