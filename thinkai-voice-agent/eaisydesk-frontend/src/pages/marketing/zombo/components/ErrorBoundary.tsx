import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] React render crash:', error.message);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '60px 40px',
          textAlign: 'center',
          color: '#e2e8f0',
          background: 'rgba(10, 8, 20, 0.95)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          fontFamily: 'Inter, sans-serif',
        }}>
          <div style={{ fontSize: '48px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Hiba történt a renderelés közben</h2>
          <p style={{ color: '#94a3b8', maxWidth: '500px', lineHeight: 1.5 }}>
            {this.state.error?.message || 'Ismeretlen hiba'}
          </p>
          <pre style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '11px',
            color: '#f87171',
            maxWidth: '600px',
            overflow: 'auto',
            textAlign: 'left',
          }}>
            {this.state.error?.stack?.split('\n').slice(0, 5).join('\n')}
          </pre>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/';
            }}
            style={{
              marginTop: '12px',
              padding: '10px 24px',
              borderRadius: '8px',
              background: 'rgba(139, 92, 246, 0.3)',
              border: '1px solid rgba(139, 92, 246, 0.5)',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Vissza a főoldalra
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
