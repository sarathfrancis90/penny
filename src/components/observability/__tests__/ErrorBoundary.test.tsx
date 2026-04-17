import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Sentry from '@sentry/nextjs';
import { ErrorBoundary } from '../ErrorBoundary';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

const Bomb = () => {
  throw new Error('boom');
};

describe('ErrorBoundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders children when no error', () => {
    render(
      <ErrorBoundary fallbackLabel="Test">
        <div>child</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('renders fallback and reports when child throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallbackLabel="Feature X">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Feature X/i)).toBeInTheDocument();
    expect(Sentry.captureException).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('recovers after retry click', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    const Maybe = () => {
      if (shouldThrow) throw new Error('boom');
      return <span>recovered</span>;
    };
    const { rerender } = render(
      <ErrorBoundary fallbackLabel="X">
        <Maybe />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    rerender(
      <ErrorBoundary fallbackLabel="X">
        <Maybe />
      </ErrorBoundary>,
    );
    expect(screen.getByText('recovered')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
