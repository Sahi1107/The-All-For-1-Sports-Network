import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { captureException } from '../config/sentry';

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string | null }

/**
 * Catches render-time crashes anywhere below it and shows a branded fallback
 * instead of a white screen — and reports the error to Sentry. Class component
 * because only class error boundaries can catch React render errors.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error, { componentStack: info.componentStack });
    // Also surface it in the console so a local crash isn't silent.
    console.error('[ErrorBoundary] render crash:', error, info.componentStack);
  }

  private handleReload = () => window.location.reload();
  private handleHome = () => { window.location.href = '/home'; };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-card rounded-2xl p-8 border border-line">
            <div className="w-16 h-16 bg-red-400/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={30} className="text-red-400" />
            </div>
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-gray-custom text-sm mb-6">
              An unexpected error occurred and this page couldn’t load. Our team has been notified —
              please try again.
            </p>

            {!import.meta.env.PROD && this.state.message && (
              <pre className="text-left text-xs text-red-300/80 bg-surface border border-line rounded-lg p-3 mb-6 overflow-auto max-h-40 whitespace-pre-wrap break-words">
                {this.state.message}
              </pre>
            )}

            <div className="space-y-3">
              <button
                onClick={this.handleReload}
                className="block w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors"
              >
                Reload page
              </button>
              <button
                onClick={this.handleHome}
                className="block w-full py-2.5 text-gray-custom hover:text-foreground transition-colors text-sm"
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
