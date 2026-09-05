import React, { Component, type ReactNode } from 'react';
import { reportError } from '../../lib/errorReporter';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportError(error, {
      error_type: 'render',
      severity: 'error',
      component: 'ReactErrorBoundary',
      context: { componentStack: errorInfo.componentStack },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          maxWidth: '520px',
          margin: '60px auto',
          background: 'var(--bg-secondary, #1e293b)',
          borderRadius: '12px',
          border: '1px solid var(--border-color, #334155)',
          color: 'var(--text-primary, #f8fafc)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
            Váratlan hiba történt a felületen
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '24px', lineHeight: 1.5 }}>
            A rendszer rögzítette a hibát az observability naplóban. Kérlek, próbáld meg újratölteni az oldalt.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                background: 'var(--accent-color, #3b82f6)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Oldal újratöltése
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                background: 'transparent',
                color: 'var(--text-secondary, #94a3b8)',
                border: '1px solid var(--border-color, #334155)',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Újrapróbálás
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
