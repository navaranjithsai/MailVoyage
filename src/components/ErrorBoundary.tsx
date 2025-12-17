import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import Button from './ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  name?: string; // Section name for better error identification
  compact?: boolean; // Smaller error display for inline sections
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
}

/**
 * Error Boundary component for catching and handling React errors gracefully
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? ` - ${this.props.name}` : ''}] Error caught:`, error);
    console.error('Component stack:', errorInfo.componentStack);
    
    this.setState({ errorInfo });
    
    // Could send to error reporting service here
    // logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    });
    this.props.onReset?.();
  };

  toggleDetails = () => {
    this.setState(state => ({ showDetails: !state.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, showDetails } = this.state;
      const { name, compact } = this.props;

      // Compact error display
      if (compact) {
        return (
          <div className="flex items-center justify-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="text-sm text-red-700 dark:text-red-400">
                  {name ? `${name} failed to load` : 'Something went wrong'}
                </p>
              </div>
              <Button
                size="small"
                variant="ghost"
                onClick={this.handleReset}
                className="ml-2 text-red-600 hover:text-red-700 dark:text-red-400"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        );
      }

      // Full error display
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
            <div>
              <h3 className="text-lg font-semibold text-red-700 dark:text-red-400">
                {name ? `${name} Error` : 'Something went wrong'}
              </h3>
              <p className="text-sm text-red-600 dark:text-red-500">
                {error?.message || 'An unexpected error occurred'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <Button
              onClick={this.handleReset}
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            
            {(error || errorInfo) && (
              <Button
                variant="ghost"
                onClick={this.toggleDetails}
                className="text-red-600 dark:text-red-400"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-1" />
                    Hide Details
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-1" />
                    Show Details
                  </>
                )}
              </Button>
            )}
          </div>

          {showDetails && (
            <div className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-lg p-4 border border-red-200 dark:border-red-800 overflow-auto">
              {error && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Error Message:
                  </h4>
                  <pre className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap break-words">
                    {error.message}
                  </pre>
                </div>
              )}
              
              {error?.stack && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Stack Trace:
                  </h4>
                  <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words max-h-32 overflow-auto">
                    {error.stack}
                  </pre>
                </div>
              )}

              {errorInfo?.componentStack && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Component Stack:
                  </h4>
                  <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words max-h-32 overflow-auto">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap any component with an error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: Omit<ErrorBoundaryProps, 'children'> = {}
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary {...options} name={options.name || displayName}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return WithErrorBoundary;
}

/**
 * Section Error Boundary - a pre-styled compact error boundary for dashboard sections
 */
export function SectionErrorBoundary({ 
  children, 
  name,
  onReset 
}: { 
  children: ReactNode; 
  name: string;
  onReset?: () => void;
}) {
  return (
    <ErrorBoundary name={name} compact onReset={onReset}>
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
