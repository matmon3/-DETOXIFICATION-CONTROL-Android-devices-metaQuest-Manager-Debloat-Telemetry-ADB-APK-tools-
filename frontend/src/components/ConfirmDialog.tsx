import { AlertTriangle } from "lucide-react";
import { useI18n } from "../hooks/useI18n";

interface Props {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AlertTriangle size={14} className={`icon ${danger ? "danger" : ""}`} />
          <span>{title}</span>
        </div>
        <div className="modal-body">{body}</div>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
