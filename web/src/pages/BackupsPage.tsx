import { useCallback, useEffect, useRef, useState } from "react";
import type { BackupTrigger, QuoteBackupSummary } from "@quotation/shared";
import { api, type QuoteImportItem } from "../api/client.js";
import ConfirmDialog from "../components/ConfirmDialog.js";
import { IconDownload, IconPlus, IconRotateCcw, IconUpload } from "../icons.js";

const TRIGGER_LABELS: Record<BackupTrigger, string> = {
  manual: "Manual Backup",
  stream_start: "Stream Start Backup",
  pre_restore: "Automated Backup",
  import: "Imported Backup",
};

function TriggerBadge({ trigger }: { trigger: BackupTrigger }) {
  return <span className={`trigger-badge trigger-${trigger}`}>{TRIGGER_LABELS[trigger]}</span>;
}

/** What's pending a restore confirmation: either an existing backup row, or a file the user
 * just picked that hasn't been sent to the server yet. Nothing is imported until the user
 * actually clicks "Restore Backup" — clicking Cancel on a freshly-picked file leaves no trace. */
type RestoreTarget =
  | { kind: "existing"; backup: QuoteBackupSummary }
  | { kind: "import"; quotes: QuoteImportItem[]; quoteCount: number };

export default function BackupsPage() {
  const [backups, setBackups] = useState<QuoteBackupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api
      .listBackups()
      .then(setBackups)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load backups"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateBackup() {
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      await api.createBackup();
      setMessage("Backup created.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create backup");
    } finally {
      setCreating(false);
    }
  }

  function handleImportClick() {
    setError(null);
    setMessage(null);
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.quotes;
      if (!Array.isArray(list)) throw new Error("File doesn't look like a backup export");
      // Nothing is sent to the server yet — just stage it for the confirmation dialog below.
      // The file is only actually imported if the user clicks "Restore Backup".
      setRestoreTarget({ kind: "import", quotes: list, quoteCount: list.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read backup file");
    }
  }

  async function handleDownload(id: number) {
    setError(null);
    try {
      const { quotes } = await api.exportBackup(id);
      const blob = new Blob([JSON.stringify({ quotes }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download backup");
    }
  }

  async function handleConfirmRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    setError(null);
    try {
      if (restoreTarget.kind === "import") {
        // Create the backup entry (this also snapshots current quotes as an Automated Backup
        // first) and restore it in one go, now that the user has actually confirmed.
        const backup = await api.importBackup(restoreTarget.quotes);
        const result = await api.restoreBackup(backup.id, true);
        setMessage(`Restored ${result.restoredCount} quotes from the imported file.`);
      } else {
        const result = await api.restoreBackup(restoreTarget.backup.id);
        setMessage(`Restored ${result.restoredCount} quotes from backup #${restoreTarget.backup.id}.`);
      }
      setRestoreTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore backup");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Backups</h1>
          <p>Saved copies of your quotes that you can restore later. Only the 7 most recent are kept, so the oldest one is removed automatically each time a new backup is made.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">
            {backups.length} of 7 backup{backups.length === 1 ? "" : "s"}
          </span>
          <div className="toolbar">
            <button className="icon-btn" title="Import backup from JSON" onClick={handleImportClick}>
              <IconUpload />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
            <span className="toolbar-divider" />
            <button className="btn btn-primary" onClick={handleCreateBackup} disabled={creating}>
              <IconPlus style={{ width: 13, height: 13 }} />
              {creating ? "Backing up…" : "Manual Backup"}
            </button>
          </div>
        </div>

        <p className="hint" style={{ padding: "10px 14px 0" }}>
          A backup is created automatically every time your stream goes live. One is also created right
          before you restore a backup, so you can always undo a restore if you change your mind.
        </p>

        {error && (
          <p className="error-text" style={{ padding: "10px 14px 0" }}>
            {error}
          </p>
        )}
        {message && (
          <p className="hint" style={{ padding: "10px 14px 0" }}>
            {message}
          </p>
        )}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 180 }}>Date</th>
                <th style={{ width: 190 }}>Trigger</th>
                <th style={{ width: 100 }}>Quotes</th>
                <th />
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {!loading && backups.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={5}>
                    No backups yet. Click "Manual Backup" above to create one now, or one will be created
                    automatically the next time you go live.
                  </td>
                </tr>
              )}
              {backups.map((b) => (
                <tr key={b.id}>
                  <td className="col-meta">{new Date(b.createdAt).toLocaleString()}</td>
                  <td>
                    <TriggerBadge trigger={b.trigger} />
                  </td>
                  <td className="col-meta">{b.quoteCount}</td>
                  <td />
                  <td className="col-actions">
                    <button className="icon-btn" title="Download" onClick={() => handleDownload(b.id)}>
                      <IconDownload />
                    </button>
                    <button
                      className="icon-btn accent"
                      title="Restore"
                      onClick={() => setRestoreTarget({ kind: "existing", backup: b })}
                    >
                      <IconRotateCcw />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {restoreTarget && (
        <ConfirmDialog
          title="Restore this backup?"
          message={
            restoreTarget.kind === "import"
              ? `This will replace all of your current quotes with the ${restoreTarget.quoteCount} quotes from the imported file. Your current quotes will be saved as an Automated Backup first, so you can undo this afterward if needed.`
              : `This will replace all of your current quotes with the ${restoreTarget.backup.quoteCount} quotes from the backup made on ${new Date(
                  restoreTarget.backup.createdAt,
                ).toLocaleString()}. Your current quotes will be saved as a new backup first, so you can undo this afterward if needed.`
          }
          confirmLabel="Restore Backup"
          busyLabel="Restoring…"
          busy={restoring}
          onConfirm={handleConfirmRestore}
          onCancel={() => setRestoreTarget(null)}
        />
      )}
    </div>
  );
}
