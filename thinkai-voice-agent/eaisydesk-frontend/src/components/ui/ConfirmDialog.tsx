import { useState } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

/** Confirm dialog – replaces legacy window.confirm() calls */
export default function ConfirmDialog({
  open,
  title = 'Megerősítés',
  message,
  confirmLabel = 'Igen',
  cancelLabel = 'Mégse',
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card modal-card-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body">
          <div className="text-lg font-bold mb-12">{title}</div>
          <div className="text-md text-muted mb-24" style={{ lineHeight: 1.6 }}>{message}</div>
          <div className="flex-row gap-10 justify-end">
            <button className="btn btn-outline" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={onConfirm}
              style={danger ? { background: '#ef4444', color: '#fff', borderColor: 'transparent' } : undefined}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hook for easy confirm dialog usage */
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    message: string;
    title?: string;
    danger?: boolean;
    resolve?: (v: boolean) => void;
  }>({ open: false, message: '' });

  function confirm(
    message: string,
    opts?: { title?: string; danger?: boolean }
  ): Promise<boolean> {
    return new Promise((resolve) => {
      setState({
        open: true,
        message,
        title: opts?.title,
        danger: opts?.danger,
        resolve,
      });
    });
  }

  const dialog = (
    <ConfirmDialog
      open={state.open}
      message={state.message}
      title={state.title}
      danger={state.danger}
      onConfirm={() => {
        state.resolve?.(true);
        setState({ open: false, message: '' });
      }}
      onCancel={() => {
        state.resolve?.(false);
        setState({ open: false, message: '' });
      }}
    />
  );

  return { confirm, ConfirmDialog: () => dialog };
}
