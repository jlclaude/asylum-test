import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { getSecondChanceEntriesForShop } from "../models/second-chance.server";
import { authenticate } from "../shopify.server";
import { formatOrdinal } from "../lib/ordinal";
import { formatRaffleCode } from "../lib/raffle-number";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const rawArchive = url.searchParams.get("archive");
  const archive =
    rawArchive === "active" || rawArchive === "archived" ? rawArchive : "all";
  const runs = await getSecondChanceEntriesForShop(session.shop, {
    search,
    archive,
  });
  return {
    filters: { search, archive },
    entries: runs.map((run) => ({
      gameId: run.game.id,
      gameTitle: run.game.title,
      raffleCode: formatRaffleCode({ year: run.game.raffleYear, number: run.game.raffleNumber }),
      gameDate: run.game.createdAt.toISOString(),
      gameStatus: run.game.status,
      archived: run.game.archivedAt !== null,
      offset: run.game.secondChanceOffset,
      calculatedAt: run.secondChanceCalculatedAt!.toISOString(),
      mainWinner: run.rounds[0]?.wheels[0]?.winnerDisplayName ?? "Unavailable",
      beforeWinner: run.secondChanceBeforeDisplayName,
      afterWinner: run.secondChanceAfterDisplayName,
    })),
  };
}

const styles = `
*{box-sizing:border-box}.sc-page{min-height:100vh;padding:28px;color:#f5f5f5;background:#101012;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.sc-shell{width:min(1180px,100%);margin:auto}.sc-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.sc-top a,.sc-button{padding:10px 14px;border:1px solid #4a4a50;border-radius:9px;color:#fff;background:#202024;text-decoration:none;font:inherit;font-weight:800}.sc-heading p{color:#d9aa55;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.sc-heading h1{margin:5px 0;font-size:clamp(30px,5vw,48px)}.sc-filter{display:grid;grid-template-columns:1fr 190px auto;gap:10px;margin:22px 0}.sc-filter input,.sc-filter select{padding:11px;border:1px solid #45454b;border-radius:9px;color:#fff;background:#151517;font:inherit}.sc-list{display:grid;gap:14px}.sc-card{padding:20px;border:1px solid #3a3a40;border-left:4px solid #b78a38;background:#19191c}.sc-card header{display:flex;justify-content:space-between;gap:16px}.sc-card h2{margin:0}.sc-meta{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;color:#aaaab0;font-size:12px}.sc-results{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.sc-results div{padding:12px;border:1px solid #39393e;background:#101012}.sc-results small,.sc-results strong{display:block}.sc-results small{margin-bottom:5px;color:#d9aa55;text-transform:uppercase}.sc-card>a{display:inline-block;margin-top:14px;color:#fff}.sc-empty{padding:30px;border:1px solid #39393e;text-align:center;color:#aaaab0}@media(max-width:700px){.sc-page{padding:18px 14px}.sc-filter,.sc-results{grid-template-columns:1fr}.sc-top,.sc-card header{align-items:flex-start;flex-direction:column}}
`;

export default function SecondChancePage() {
  const { entries, filters } = useLoaderData<typeof loader>();
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <main className="sc-page">
        <div className="sc-shell">
          <div className="sc-top">
            <div className="sc-heading">
              <p>Current drawing ledger</p>
              <h1>Second Chance Entries</h1>
            </div>
            <Link to="/app">Back to dashboard</Link>
          </div>
          <Form className="sc-filter" method="get">
            <input
              name="search"
              type="search"
              defaultValue={filters.search}
              placeholder="Search raffle, game, or winner"
              aria-label="Search by raffle number, game title, or winner name"
            />
            <select
              name="archive"
              defaultValue={filters.archive}
              aria-label="Filter by archive state"
            >
              <option value="all">Active and archived</option>
              <option value="active">Active games</option>
              <option value="archived">Archived games</option>
            </select>
            <button className="sc-button" type="submit">
              Filter
            </button>
          </Form>
          <section className="sc-list" aria-label="Second Chance free entries">
            {entries.length ? (
              entries.map((entry) => (
                <article className="sc-card" key={entry.gameId}>
                  <header>
                    <div><strong>{entry.raffleCode}</strong><h2>{entry.gameTitle}</h2></div>
                    <strong>
                      {entry.archived
                        ? "ARCHIVED"
                        : entry.gameStatus.replace("_", " ")}
                    </strong>
                  </header>
                  <div className="sc-meta">
                    <span>Game: {formatDate(entry.gameDate)}</span>
                    <span>Offset: {formatOrdinal(entry.offset)}</span>
                    <span>Calculated: {formatDate(entry.calculatedAt)}</span>
                  </div>
                  <div className="sc-results">
                    <div>
                      <small>Main winner</small>
                      <strong>{entry.mainWinner}</strong>
                    </div>
                    <div>
                      <small>Before free entry</small>
                      <strong>
                        {entry.beforeWinner ?? "No eligible entry"}
                      </strong>
                    </div>
                    <div>
                      <small>After free entry</small>
                      <strong>
                        {entry.afterWinner ?? "No eligible entry"}
                      </strong>
                    </div>
                  </div>
                  <Link to={`/app/games/${entry.gameId}`}>
                    Open Game Control Center
                  </Link>
                </article>
              ))
            ) : (
              <div className="sc-empty">
                No Second Chance entries match these filters.
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
