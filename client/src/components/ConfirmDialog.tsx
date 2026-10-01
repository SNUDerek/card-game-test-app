import type { ReactNode } from "react";
import "./ConfirmDialog.css";

export interface DialogAction {
  label: string;
  onClick(): void;
  tone?: "danger" | "primary";
  disabled?: boolean;
}

/** In-page modal; replaces window.confirm so it can carry extra actions. */
export function ConfirmDialog({
  title,
  children,
  actions,
  onCancel,
}: {
  title: string;
  children?: ReactNode;
  actions: DialogAction[];
  onCancel(): void;
}) {
  return (
    <div className="confirm-backdrop" onKeyDown={(event) => event.key === "Escape" && onCancel()}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children && <div className="confirm-body">{children}</div>}
        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.tone ? `is-${action.tone}` : undefined}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
