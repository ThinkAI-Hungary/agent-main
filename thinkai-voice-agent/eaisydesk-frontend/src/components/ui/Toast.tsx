import { useEffect, useState } from 'react';

interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

let toastId = 0;
let addToastFn: ((text: string, type?: 'success' | 'error' | 'info') => void) | null = null;

/** Show a toast notification from anywhere */
export function showToast(text: string, type: 'success' | 'error' | 'info' = 'success') {
  if (addToastFn) addToastFn(text, type);
}

/** Toast container – render once at the app root */
export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    addToastFn = (text, type = 'success') => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, text, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    };
    return () => {
      addToastFn = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {toasts.map((t) => {
        const bgMap = {
          success: 'linear-gradient(135deg,#1ceee0,#0dbcb4)',
          error: 'linear-gradient(135deg,#ef4444,#dc2626)',
          info: 'linear-gradient(135deg,#3b82f6,#2563eb)',
        };
        return (
          <div
            key={t.id}
            style={{
              background: bgMap[t.type],
              color: t.type === 'success' ? '#082432' : '#fff',
              padding: '14px 24px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'Inter, sans-serif',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              animation: 'fadeIn 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {t.type === 'success' && (
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
                style={{ width: 18, height: 18 }}
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {t.type === 'error' && (
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
                style={{ width: 18, height: 18 }}
              >
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {t.text}
          </div>
        );
      })}
    </div>
  );
}
