'use client';

import React, { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack ?? undefined } },
      tags: { boundary: this.props.fallbackLabel ?? 'unknown' },
    });
  }

  handleReset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-900 dark:text-red-100"
      >
        <h2 className="font-semibold mb-2">
          {this.props.fallbackLabel ?? 'Something went wrong'}
        </h2>
        <p className="text-sm mb-3">
          We&apos;ve been notified. Try refreshing; your data is safe.
        </p>
        <button
          onClick={this.handleReset}
          className="text-sm underline"
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }
}
