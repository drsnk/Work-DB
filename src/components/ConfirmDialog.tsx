import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border p-6 shadow-xl"
        style={{
          backgroundColor: 'var(--fv-surface)',
          borderColor: 'var(--fv-border)',
          color: 'var(--fv-ink)',
        }}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2.5">
            {destructive && (
              <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: 'var(--fv-danger)' }} />
            )}
            <h3 className="font-display text-lg font-semibold">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:opacity-70 cursor-pointer"
            aria-label="Close confirmation dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--fv-muted)' }}>
          {message}
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 min-h-[44px] rounded-lg border text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
            style={{
              borderColor: 'var(--fv-border)',
              backgroundColor: 'var(--fv-subtle)',
              color: 'var(--fv-ink)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
            style={{
              backgroundColor: destructive ? 'var(--fv-danger)' : 'var(--fv-accent)',
              color: '#ffffff',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
