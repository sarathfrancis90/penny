import { describe, it, expect, vi, beforeEach } from 'vitest';
import { track, __testing__, type TrackableEvent } from '../analytics';

vi.mock('../posthog', () => ({
  posthog: { capture: vi.fn() },
}));

describe('analytics.track', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OBSERVABILITY_ENABLED = 'true';
  });

  it('accepts known event types without throwing', () => {
    const e: TrackableEvent = 'expense_added';
    expect(() => track(e, { category: 'Meals and entertainment' })).not.toThrow();
  });

  it('no-ops when OBSERVABILITY_ENABLED is false', async () => {
    process.env.OBSERVABILITY_ENABLED = 'false';
    const posthogMod = await import('../posthog');
    track('expense_added', { category: 'x' });
    expect(posthogMod.posthog.capture).not.toHaveBeenCalled();
  });

  it('forwards sanitized properties when enabled', async () => {
    const posthogMod = await import('../posthog');
    track('expense_added', { category: 'Travel', amount: 42, vendor: 'Esso' });
    expect(posthogMod.posthog.capture).toHaveBeenCalledWith(
      'expense_added',
      { category: 'Travel' },
    );
  });

  describe('stripPII', () => {
    it('removes banned fields', () => {
      const out = __testing__.stripPII({
        category: 'Meals',
        amount: 10,
        vendor: 'Chipotle',
        email: 'x@y',
      });
      expect(out).toEqual({ category: 'Meals' });
    });

    it('strips case-insensitively', () => {
      const out = __testing__.stripPII({
        Category: 'x',
        Amount: 1,
        VENDOR: 'y',
      });
      expect(out).toEqual({ Category: 'x' });
    });

    it('preserves non-PII fields', () => {
      const out = __testing__.stripPII({
        category: 'x',
        isGroup: true,
        memberCount: 5,
        frequency: 'monthly',
      });
      expect(out).toEqual({
        category: 'x',
        isGroup: true,
        memberCount: 5,
        frequency: 'monthly',
      });
    });
  });
});
