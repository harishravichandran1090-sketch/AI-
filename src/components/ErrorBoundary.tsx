import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected interface error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('JARVIS ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen hud-cyber-grid flex items-center justify-center p-6 text-slate-100">
          <div className="max-w-lg w-full rounded-xl bg-slate-900/80 backdrop-blur-md border border-cyan-500/30 p-6 space-y-4">
            <h1 className="font-display text-lg font-semibold tracking-wider text-cyan-400">
              JARVIS HUD Recovery
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Daddy, a subsystem encountered an unexpected state. You can reset the HUD view below.
            </p>
            <pre className="text-xs font-mono bg-slate-950/80 border border-slate-800 rounded-lg p-3 overflow-x-auto text-rose-300">
              {this.state.errorMessage}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
            >
              Reload JARVIS HUD
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
