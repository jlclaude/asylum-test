import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { requireHostUser } from "../lib/host-auth.server";
import { getArchivedGamesForShop } from "../models/game.server";
import { formatRaffleCode } from "../lib/raffle-number";
export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostUser(request);
  const games = await getArchivedGamesForShop(host.shop);
  return {
    games: games.map((game) => ({
      id: game.id,
      title: game.title,
      status: game.status,
      raffleCode: formatRaffleCode({
        year: game.raffleYear,
        number: game.raffleNumber,
      }),
    })),
  };
}
export default function HostArchived() {
  const { games } = useLoaderData<typeof loader>();
  return (
    <>
      <header className="host-header">
        <p className="host-kicker">Archive</p>
        <h1>Archived Games</h1>
      </header>
      <section className="host-grid">
        {games.map((game) => (
          <article className="host-card" key={game.id}>
            <span className="host-status">{game.status}</span>
            <h2>
              {game.raffleCode} · {game.title}
            </h2>
            <Link className="host-link" to={`/host/games/${game.id}`}>
              Open Detail
            </Link>
          </article>
        ))}
      </section>
    </>
  );
}
