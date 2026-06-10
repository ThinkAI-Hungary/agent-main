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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--card, #fff)',
          borderRadius: 16,
          padding: 28,
          width: 380,
          maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text)',
            marginBottom: 12,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          {message}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: danger
                ? '#ef4444'
                : 'linear-gradient(135deg,#1ceee0,#0bbdb1)',
              color: danger ? '#fff' : '#082432',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: danger
                ? '0 4px 12px rgba(239,68,68,0.3)'
                : '0 4px 12px rgba(28,238,224,0.3)',
            }}
          >
            {confirmLabel}
          </button>
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
