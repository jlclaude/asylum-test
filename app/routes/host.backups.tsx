import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import {
  requireHostMutation,
  requireHostPermission,
} from "../lib/host-auth.server";
import {
  listBackupGames,
  previewBackupRestore,
  restoreEmergencyBackup,
} from "../services/backup.server";
import { MAX_BACKUP_BYTES } from "../lib/backup-constants";
import { formatRaffleCode } from "../lib/raffle-number";
export async function loader({ request }: LoaderFunctionArgs) {
  const host = await requireHostPermission(request, "backups:manage");
  const games = await listBackupGames(host.shop);
  return {
    csrfToken: host.csrfToken,
    games: games.map((g) => ({
      id: g.id,
      title: g.title,
      raffleCode: formatRaffleCode({
        year: g.raffleYear,
        number: g.raffleNumber,
      }),
      status: g.status,
    })),
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BACKUP_BYTES + 256000)
    return { error: "Upload exceeds the backup limit." };
  const formData = await request.formData();
  const host = await requireHostMutation(request, "backups:manage", formData);
  const file = formData.get("backup");
  if (
    !file ||
    typeof file === "string" ||
    file.size === 0 ||
    file.size > MAX_BACKUP_BYTES
  )
    return { error: "Choose a valid backup JSON file." };
  try {
    const text = await file.text();
    if (formData.get("intent") === "preview-restore") {
      const result = await previewBackupRestore(text, host.shop);
      return { preview: result.preview, conflicts: result.conflicts };
    }
    if (formData.get("intent") === "restore-backup") {
      const preview = await restoreEmergencyBackup({
        text,
        shop: host.shop,
        confirmation: String(formData.get("confirmation") ?? ""),
      });
      return {
        success: `Backup restored: ${preview.games} games and ${preview.claims} claims.`,
      };
    }
    return { error: "Unknown backup action." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Backup request failed.",
    };
  }
}
export default function HostBackups() {
  const { games, csrfToken } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const q = `csrf=${encodeURIComponent(csrfToken)}`;
  return (
    <>
      <header className="host-header">
        <p className="host-kicker">Owner recovery</p>
        <h1>Backup &amp; Export</h1>
      </header>
      {data?.error ? (
        <p className="host-message host-error">{data.error}</p>
      ) : null}
      {data?.success ? (
        <p className="host-message host-success">{data.success}</p>
      ) : null}
      <section className="host-card">
        <h2>Emergency Backup</h2>
        <a
          className="host-button"
          href={`/host/backups/export?type=backup&${q}`}
        >
          Create Backup
        </a>
      </section>
      <section className="host-card">
        <h2>Raffle Exports</h2>
        {games.map((g) => (
          <p key={g.id}>
            {g.raffleCode} · {g.title}{" "}
            <a
              className="host-link"
              href={`/host/backups/export?type=raffle-json&gameId=${g.id}&${q}`}
            >
              JSON
            </a>{" "}
            <a
              className="host-link"
              href={`/host/backups/export?type=claims-csv&gameId=${g.id}&${q}`}
            >
              Claims
            </a>{" "}
            <a
              className="host-link"
              href={`/host/backups/export?type=winners-csv&gameId=${g.id}&${q}`}
            >
              Winners
            </a>
          </p>
        ))}
        <a
          className="host-link"
          href={`/host/backups/export?type=prize-claims-csv&${q}`}
        >
          Private Prize Claims CSV
        </a>
      </section>
      <section className="host-card">
        <h2>Restore</h2>
        {data && "preview" in data && data.preview ? (
          <pre>{JSON.stringify(data.preview, null, 2)}</pre>
        ) : null}
        <Form className="host-form" method="post" encType="multipart/form-data">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <label>
            Backup JSON
            <input
              type="file"
              name="backup"
              accept="application/json"
              required
            />
          </label>
          <label>
            Confirmation
            <input name="confirmation" placeholder="RESTORE" />
          </label>
          <div className="host-actions">
            <button name="intent" value="preview-restore">
              Preview
            </button>
            <button name="intent" value="restore-backup">
              Restore
            </button>
          </div>
        </Form>
      </section>
    </>
  );
}
