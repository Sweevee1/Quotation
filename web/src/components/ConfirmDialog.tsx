import { IconAlertTriangle } from "../icons.js";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  busyLabel = "Deleting…",
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">
          <IconAlertTriangle />
        </div>
        <h2 className="modal-title">{title}</h2>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy} autoFocus>
            Cancel
          </button>
          <button className="btn btn-danger-solid" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
