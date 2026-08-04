import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isRouteErrorResponse, Link, useLoaderData, useRouteError } from "react-router";
import { RestoreBackupForm } from "../components/backups/RestoreBackupForm";
import { MAX_BACKUP_BYTES } from "../lib/backup-constants";
import { formatRaffleCode } from "../lib/raffle-number";
import { listBackupGames, previewBackupRestore, restoreEmergencyBackup } from "../services/backup.server";
import { authenticate } from "../shopify.server";
import "../styles/backups.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const games = await listBackupGames(session.shop);
  return { games: games.map((game) => ({
    id: game.id, raffleCode: formatRaffleCode(game.raffleNumber), title: game.title,
    status: game.status, archived: Boolean(game.archivedAt),
  })) };
}

async function uploadedBackup(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BACKUP_BYTES + 256_000) throw new Error("Upload exceeds the 10 MB backup limit.");
  const formData = await request.formData();
  const file = formData.get("backup");
  if (!file || typeof file === "string" || file.size === 0) throw new Error("Choose a backup JSON file.");
  if (file.size > MAX_BACKUP_BYTES) throw new Error("Upload exceeds the 10 MB backup limit.");
  return { text: await file.text(), formData };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  try {
    const { text, formData } = await uploadedBackup(request);
    const intent = String(formData.get("intent") ?? "");
    if (intent === "preview-restore") {
      const result = await previewBackupRestore(text, session.shop);
      return { preview: result.preview, conflicts: result.conflicts };
    }
    if (intent === "restore-backup") {
      const preview = await restoreEmergencyBackup({
        text, shop: session.shop, confirmation: String(formData.get("confirmation") ?? ""),
      });
      return { success: `Backup restored: ${preview.games} games and ${preview.claims} claims recreated.`, preview };
    }
    return { error: "Unknown restore action." };
  } catch (error) {
    console.error("Backup restore request failed", {
      shop: session.shop,
      error: error instanceof Error ? error.message : "Unknown restore failure",
    });
    return { error: error instanceof Error ? error.message : "Backup could not be processed." };
  }
}

export default function BackupsPage() {
  const { games } = useLoaderData<typeof loader>();
  return <main className="backups-page"><div className="backups-shell">
    <Link className="backups-back" to="/app/settings">← Back to Settings</Link>
    <header className="backups-header"><p>Settings</p><h1>Backup & Export</h1><span>Download shop-scoped recovery data and persisted raffle records before production deployment.</span></header>
    <section className="backup-card"><h2>Emergency Backup</h2><p>Creates a versioned JSON backup in memory. Sessions, Shopify tokens, secrets, and recoverable prize links are excluded.</p><a className="backup-button" href="/app/backups/export?type=backup">Create Emergency Backup</a></section>
    <section className="backup-card"><h2>Raffle Exports</h2><p>Select one raffle. Every export uses saved database state; winners are never recalculated.</p>
      {games.length ? <div className="backup-game-list">{games.map((game) => <article key={game.id}><div><strong>{game.raffleCode} · {game.title}</strong><small>{game.status}{game.archived ? " · Archived" : ""}</small></div><div className="backup-actions"><a href={`/app/backups/export?type=raffle-json&gameId=${encodeURIComponent(game.id)}`}>JSON</a><a href={`/app/backups/export?type=claims-csv&gameId=${encodeURIComponent(game.id)}`}>Claims CSV</a><a href={`/app/backups/export?type=winners-csv&gameId=${encodeURIComponent(game.id)}`}>Winners CSV</a></div></article>)}</div> : <p>No raffles are available.</p>}
      <div className="backup-actions backup-all-actions"><a href="/app/backups/export?type=claims-csv">All Claims CSV</a><a href="/app/backups/export?type=winners-csv">All Winners CSV</a></div>
    </section>
    <section className="backup-card backup-private"><h2>Prize Claim Export</h2><p><strong>Private fulfillment data:</strong> this CSV contains recipient names and shipping addresses. Store it securely.</p><a className="backup-button" href="/app/backups/export?type=prize-claims-csv">Export Prize Claims CSV</a></section>
    <section className="backup-card backup-restore"><h2>Restore</h2><p>Restore is allowed only when this shop contains no Asylum application data. Sessions are always preserved.</p><RestoreBackupForm /></section>
  </div></main>;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status}: ${error.statusText || "Backup request failed."}`
    : error instanceof Error ? error.message : "Backup tools could not be loaded.";
  return <main className="backups-page"><div className="backups-shell"><h1>Backup &amp; Export Error</h1><p role="alert">{message}</p><Link className="backups-back" to="/app/settings">Return to Settings</Link></div></main>;
}
