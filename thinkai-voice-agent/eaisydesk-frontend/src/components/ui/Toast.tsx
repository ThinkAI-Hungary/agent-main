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
      }, 3200);
    };
    return () => {
      addToastFn = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="toast-container"
    >
      {toasts.map((t) => {
        const bgMap = {
          success: 'linear-gradient(135deg,#1ceee0,#0dbcb4)',
          error: 'linear-gradient(135deg,#ef4444,#dc2626)',
          info: 'linear-gradient(135deg,#3b82f6,#2563eb)',
        };
        const iconMap = {
          success: (
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="toast-icon">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ),
          error: (
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="toast-icon">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          ),
          info: (
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="toast-icon">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          ),
        };
        return (
          <div
            key={t.id}
            className="toast-premium toast-item"
            style={{
              background: bgMap[t.type],
              color: t.type === 'success' ? '#082432' : '#fff',
            }}
          >
            {iconMap[t.type]}
            {t.text}
            <div className={`toast-progress ${t.type}`} />
          </div>
        );
      })}
    </div>
  );
}
