// src/components/runtime/ErrorBoundary.tsx
"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  componentType?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production, send to your error tracking service (e.g. Sentry)
    console.error("[RuntimeErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50">
          <p className="text-sm font-medium text-red-700">
            Render error{this.props.componentType ? ` in "${this.props.componentType}"` : ""}
          </p>
          <p className="text-xs text-red-500 mt-1 font-mono break-all">
            {this.state.errorMessage}
          </p>
          <button
            className="mt-2 text-xs text-red-600 underline"
            onClick={() => this.setState({ hasError: false, errorMessage: "" })}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
