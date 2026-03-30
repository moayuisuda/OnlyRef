import { Component, type ErrorInfo, type ReactNode } from 'react';
import { globalActions } from '../store/globalStore';
import { ErrorDisplay } from './ErrorDisplay';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    window.electron?.log?.('error', 'React ErrorBoundary caught an error:', error.message, errorInfo.componentStack);
    globalActions.pushToast({ key: 'toast.reactError', params: { message: error.message } }, 'error');
  }

  public render() {
    if (this.state.hasError) {
      return <ErrorDisplay error={this.state.error} />;
    }

    return this.props.children;
  }
}
