import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsentBanner } from '../ConsentBanner';
import { CONSENT_COOKIE } from '@/lib/observability/consent';

vi.mock('@/lib/observability/posthog', () => ({
  onConsentChange: vi.fn(),
}));

describe('ConsentBanner', () => {
  beforeEach(() => {
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  });

  it('renders when consent is unset', () => {
    render(<ConsentBanner />);
    expect(screen.getByRole('button', { name: /accept all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /essential only/i })).toBeInTheDocument();
  });

  it('hides after accept click', async () => {
    render(<ConsentBanner />);
    await userEvent.click(screen.getByRole('button', { name: /accept all/i }));
    expect(
      screen.queryByRole('button', { name: /accept all/i }),
    ).not.toBeInTheDocument();
  });

  it('hides after deny click', async () => {
    render(<ConsentBanner />);
    await userEvent.click(screen.getByRole('button', { name: /essential only/i }));
    expect(
      screen.queryByRole('button', { name: /essential only/i }),
    ).not.toBeInTheDocument();
  });

  it('does not render when consent already granted', () => {
    document.cookie = `${CONSENT_COOKIE}=granted; Path=/`;
    render(<ConsentBanner />);
    expect(
      screen.queryByRole('button', { name: /accept all/i }),
    ).not.toBeInTheDocument();
  });

  it('does not render when consent already denied', () => {
    document.cookie = `${CONSENT_COOKIE}=denied; Path=/`;
    render(<ConsentBanner />);
    expect(
      screen.queryByRole('button', { name: /accept all/i }),
    ).not.toBeInTheDocument();
  });
});
