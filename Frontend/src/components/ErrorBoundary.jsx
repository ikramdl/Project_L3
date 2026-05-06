import React from 'react';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#0f172a',
          color: 'white',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif'
        }}>
          <AlertTriangle size={64} color="#ef4444" />
          <h1 style={{ fontSize: '24px', marginTop: '20px' }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8', maxWidth: '500px', marginTop: '8px' }}>
            A component failed to render. The dashboard may still be partially usable.
          </p>
          <pre style={{
            background: '#1e293b',
            padding: '12px',
            borderRadius: '8px',
            marginTop: '16px',
            fontSize: '12px',
            color: '#fbbf24',
            maxWidth: '600px',
            overflow: 'auto'
          }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '20px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;