
import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  // Fix for "Property 'children' is missing" in index.tsx: Made children optional.
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Using React.Component explicitly and declaring props/state members to resolve TypeScript "Property does not exist" errors.
class ErrorBoundary extends React.Component<Props, State> {
  // Explicit declaration to ensure properties are recognized by the compiler
  public props: Props;
  public state: State;

  constructor(props: Props) {
    super(props);
    // Initializing properties locally to guarantee existence in this context
    this.props = props;
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    // Accessing this.state safely after explicit declaration
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h1>
            <p className="text-slate-500 text-sm mb-6">The application encountered an unexpected error.</p>
            <div className="bg-slate-50 p-3 rounded-lg text-left mb-6 overflow-auto max-h-32 border border-slate-100">
                <code className="text-xs text-red-500 font-mono break-all block">
                    {this.state.error?.message || "Unknown Error"}
                </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    // Accessing this.props.children safely from the explicitly declared member.
    return this.props.children || null;
  }
}

export default ErrorBoundary;
