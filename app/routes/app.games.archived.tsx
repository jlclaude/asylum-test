import type { GameStatus } from "@prisma/client";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { getArchivedGamesForShop, permanentlyDeleteGame, restoreGame } from "../models/game.server";
import { authenticate } from "../shopify.server";
import { formatRaffleCode } from "../lib/raffle-number";

const GAME_STATUSES = ["OPEN", "CLOSED", "READY", "IN_PROGRESS", "COMPLETED"];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const requestedStatus = url.searchParams.get("status") ?? "ALL";
  const status: GameStatus | "ALL" = GAME_STATUSES.includes(requestedStatus)
    ? requestedStatus as GameStatus
    : "ALL";
  const sort = url.searchParams.get("sort") === "oldest" ? "oldest" : "newest";
  const games = await getArchivedGamesForShop(session.shop, { search, status, sort });
  return {
    filters: { search, status, sort },
    deleted: url.searchParams.get("deleted") === "1",
    games: games.map((game) => ({
      id: game.id,
      raffleCode: formatRaffleCode(game.raffleNumber),
      title: game.title,
      status: game.status,
      totalSpots: game.totalSpots,
      wheelCount: game.wheelCount,
      archivedAt: game.archivedAt?.toISOString() ?? "",
      createdAt: game.createdAt.toISOString(),
      updatedAt: game.updatedAt.toISOString(),
      confirmedQuantity: game.claims.reduce((sum, claim) => sum + claim.quantity, 0),
      results: game.run?.rounds
        .flatMap((round) => round.wheels)
        .filter((wheel) => wheel.status === "COMPLETED")
        .map((wheel) => `${wheel.label}: ${wheel.winnerDisplayName ?? wheel.winnerValue ?? "Saved"}`) ?? [],
    })),
  };
}

type ActionData = { error?: string; success?: string };

export async function action({ request }: ActionFunctionArgs): Promise<Response | ActionData> {
  const { session, redirect } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  try {
    if (intent === "restore-game") {
      const restored = await restoreGame(gameId, session.shop);
      return restored.count ? { success: "Game restored." } : { error: "Archived game not found." };
    }
    if (intent === "delete-game") {
      await permanentlyDeleteGame(gameId, session.shop, String(formData.get("deleteConfirmation") ?? ""));
      return redirect("/app/games/archived?deleted=1");
    }
    return { error: "Unknown archived-game action." };
  } catch (error) {
    console.error("Archived game action failed:", error);
    return { error: error instanceof Error ? error.message : "The action could not be completed." };
  }
}

const styles = `
  :root{color-scheme:dark}*{box-sizing:border-box}.archive-page{min-height:100%;padding:28px;color:#f5f5f5;background:radial-gradient(circle at top right,rgba(155,22,34,.18),transparent 35%),linear-gradient(145deg,#0d0d0f,#171719 52%,#101012);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.archive-shell{width:min(1100px,100%);margin:auto}.archive-back{color:#aaaab0;text-decoration:none;font-weight:750}.archive-header{margin:24px 0}.archive-header h1{margin:6px 0;font-size:clamp(30px,5vw,44px)}.archive-header p,.archive-card p{color:#999aa0}.archive-filters{display:grid;grid-template-columns:1fr auto auto auto;gap:9px;margin-bottom:20px}.archive-filters input,.archive-filters select,.archive-filters button,.archive-button{min-height:40px;padding:0 11px;border:1px solid #434349;border-radius:8px;color:#fff;background:#19191c;font:inherit;text-decoration:none}.archive-list{display:grid;gap:15px}.archive-card{padding:22px;border:1px solid #343439;border-radius:16px;background:#1a1a1d}.archive-card header{display:flex;justify-content:space-between;gap:18px}.archive-card h2{margin:0}.archive-meta{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.archive-meta span{padding:6px 8px;border:1px solid #414147;border-radius:999px;font-size:12px}.archive-results{margin:13px 0;padding-left:20px}.archive-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:16px}.archive-actions form{margin:0}.archive-danger{margin-top:14px;padding:14px;border:1px solid #7a2833;background:#34181d}.archive-danger form{display:grid;gap:9px;margin-top:10px}.archive-danger input{min-height:40px;padding:0 10px;border:1px solid #6f3941;color:#fff;background:#111}.archive-delete{border-color:#a93443;background:#721f2a}.archive-message{padding:12px;margin-bottom:15px;border-radius:8px;background:#173822;color:#b9efc9}.archive-error{background:#4a2027;color:#ffb0b8}@media(max-width:720px){.archive-page{padding:18px 14px}.archive-filters{grid-template-columns:1fr}.archive-card header{flex-direction:column}}
`;

const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function ArchivedGamesPage() {
  const { deleted, filters, games } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  return <><style dangerouslySetInnerHTML={{ __html: styles }} /><main className="archive-page"><div className="archive-shell">
    <Link className="archive-back" to="/app">← Active games</Link><header className="archive-header"><p>Preserved records</p><h1>Archived Games</h1><p>Archived games retain claims, payment status, wheels, winners, and results.</p></header>
    {deleted ? <p className="archive-message" role="status">Game permanently deleted.</p> : null}{actionData?.success ? <p className="archive-message" role="status">{actionData.success}</p> : null}{actionData?.error ? <p className="archive-message archive-error" role="alert">{actionData.error}</p> : null}
    <Form className="archive-filters" method="get"><input type="search" name="search" defaultValue={filters.search} placeholder="Search title or raffle number" aria-label="Search archived games by title or raffle number" /><select name="status" defaultValue={filters.status} aria-label="Filter archived games by status"><option value="ALL">All statuses</option>{GAME_STATUSES.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select><select name="sort" defaultValue={filters.sort} aria-label="Sort by archived date"><option value="newest">Recently archived</option><option value="oldest">Oldest archived</option></select><button>Apply</button></Form>
    <section className="archive-list" aria-label="Archived games">{games.length === 0 ? <div className="archive-card">No archived games match this view.</div> : games.map((game) => <article className="archive-card" key={game.id}><header><div><strong>{game.raffleCode}</strong><h2>{game.title}</h2><p>Gameplay status: {game.status.replace("_", " ")}</p></div><Link className="archive-button" aria-label={`Open ${game.raffleCode} ${game.title}`} to={`/app/games/${game.id}`}>Open / View</Link></header><div className="archive-meta"><span>Archived {formatDate(game.archivedAt)}</span><span>Created {formatDate(game.createdAt)}</span><span>Updated {formatDate(game.updatedAt)}</span><span>{game.totalSpots} spots</span><span>{game.confirmedQuantity} confirmed</span><span>{game.wheelCount} name wheels</span></div>{game.results.length ? <div><strong>Saved results</strong><ul className="archive-results">{game.results.map((result, index) => <li key={`${result}-${index}`}>{result}</li>)}</ul></div> : null}<div className="archive-actions"><Form method="post"><input type="hidden" name="intent" value="restore-game" /><input type="hidden" name="gameId" value={game.id} /><button className="archive-button" disabled={busy}>Restore</button></Form></div><details className="archive-danger"><summary>Permanent Delete</summary><p>This permanently deletes claims, payments, wheel history, and results. Raffle numbers are never reused.</p><Form method="post"><input type="hidden" name="intent" value="delete-game" /><input type="hidden" name="gameId" value={game.id} /><label htmlFor={`confirm-${game.id}`}>Type “{game.title}” or DELETE</label><input id={`confirm-${game.id}`} name="deleteConfirmation" required /><button className="archive-button archive-delete" disabled={busy}>Permanently Delete</button></Form></details></article>)}</section>
  </div></main></>;
}
