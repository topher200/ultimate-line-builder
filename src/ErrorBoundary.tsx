import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center text-slate-100">
          <h1 className="text-xl font-bold text-red-400">Something broke</h1>
          <pre className="max-w-full overflow-auto whitespace-pre-wrap text-sm text-slate-300">
            {this.state.error.message}
          </pre>
          <button
            className="rounded bg-slate-700 px-4 py-2"
            onClick={() => location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
