import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackTitle?: string;
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
        console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-8 ring-amber-50/50">
                        <AlertTriangle size={32} />
                    </div>
                    <h2 className="mt-4 text-lg font-bold text-slate-900">
                        {this.props.fallbackTitle || 'Something went wrong loading this view'}
                    </h2>
                    <p className="mt-2 max-w-md text-xs text-slate-500 leading-relaxed">
                        An unexpected issue occurred while rendering. You can safely reload the view without losing your saved data.
                    </p>
                    {this.state.error?.message && (
                        <div className="mt-3 max-w-lg rounded-lg bg-slate-100 p-2.5 font-mono text-[11px] text-slate-700 break-words text-left">
                            {this.state.error.message}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={this.handleReset}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#364c83] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#283863] transition"
                    >
                        <RotateCcw size={14} />
                        Reload Exams Hub
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
