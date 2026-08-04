import { useFetcher } from "react-router";
import { MAX_BACKUP_BYTES, RESTORE_CONFIRMATION } from "../../lib/backup-constants";

type RestoreActionData = {
  error?: string;
  success?: string;
  preview?: {
    exportedAt: string;
    games: number;
    claims: number;
    runs: number;
    rounds: number;
    wheels: number;
    templates: number;
    prizeClaims: number;
    raffleSequenceNextValue: number;
    openPrizeLinksRevoked: number;
  };
  conflicts?: string[];
};

export function RestoreBackupForm() {
  const fetcher = useFetcher<RestoreActionData>();
  const preview = fetcher.data?.preview;
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post" encType="multipart/form-data" className="backup-restore-form">
      <label>
        Backup JSON file
        <input type="file" name="backup" accept="application/json,.json" required />
      </label>
      <p className="backup-note">Maximum file size: {(MAX_BACKUP_BYTES / 1024 / 1024).toFixed(0)} MB. Uploading previews only; it does not write data.</p>
      <button className="backup-button" type="submit" name="intent" value="preview-restore" disabled={busy}>
        {busy ? "Checking…" : "Preview Restore"}
      </button>
      {fetcher.data?.error ? <p className="backup-message backup-error" role="alert">{fetcher.data.error}</p> : null}
      {fetcher.data?.success ? <p className="backup-message backup-success" role="status">{fetcher.data.success}</p> : null}
      {preview ? (
        <section className="backup-preview" aria-labelledby="restore-preview-title">
          <h3 id="restore-preview-title">Restore Preview</h3>
          <dl>
            <div><dt>Exported</dt><dd>{new Date(preview.exportedAt).toLocaleString()}</dd></div>
            <div><dt>Games</dt><dd>{preview.games}</dd></div>
            <div><dt>Claims</dt><dd>{preview.claims}</dd></div>
            <div><dt>Runs / Rounds</dt><dd>{preview.runs} / {preview.rounds}</dd></div>
            <div><dt>Wheels</dt><dd>{preview.wheels}</dd></div>
            <div><dt>Templates</dt><dd>{preview.templates}</dd></div>
            <div><dt>Prize claims</dt><dd>{preview.prizeClaims}</dd></div>
            <div><dt>Next raffle</dt><dd>{preview.raffleSequenceNextValue}</dd></div>
          </dl>
          <p className="backup-warning">{preview.openPrizeLinksRevoked} open prize links will be restored as revoked and unavailable.</p>
          {fetcher.data?.conflicts?.length ? (
            <ul className="backup-conflicts">{fetcher.data.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul>
          ) : (
            <>
              <label>
                Type {RESTORE_CONFIRMATION}
                <input name="confirmation" autoComplete="off" />
              </label>
              <button className="backup-button backup-button-danger" type="submit" name="intent" value="restore-backup" disabled={busy}>
                Restore Empty Shop From Backup
              </button>
            </>
          )}
        </section>
      ) : null}
    </fetcher.Form>
  );
}
