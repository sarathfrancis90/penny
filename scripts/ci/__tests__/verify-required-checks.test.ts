import { describe, expect, it } from 'vitest';

const {
  evaluateRequiredChecks,
  parseRequiredChecks,
  verifyRequiredChecks,
} = await import('../verify-required-checks.cjs');

describe('verify required checks', () => {
  it('parses newline-delimited required checks', () => {
    expect(parseRequiredChecks('\napi-ci\nsecurity-ci\n\nmobile-ios-ci\n')).toEqual([
      'api-ci',
      'security-ci',
      'mobile-ios-ci',
    ]);
  });

  it('requires every check to complete successfully', () => {
    const result = evaluateRequiredChecks(
      [
        { name: 'api-ci', status: 'completed', conclusion: 'success' },
        { name: 'security-ci', status: 'completed', conclusion: 'failure' },
        { name: 'mobile-ios-ci', status: 'in_progress', conclusion: null },
      ],
      ['api-ci', 'security-ci', 'mobile-ios-ci', 'missing-ci'],
    );

    expect(result.success).toBe(false);
    expect(result.failures).toEqual(['security-ci: failure']);
    expect(result.pending).toEqual(['mobile-ios-ci: in_progress', 'missing-ci: missing']);
  });

  it('fails immediately on completed non-success checks', async () => {
    await expect(
      verifyRequiredChecks({
        repository: 'owner/repo',
        sha: 'abc',
        token: 'token',
        requiredChecks: ['api-ci'],
        timeoutMs: 1,
        pollMs: 1,
        fetchRuns: async () => [{ name: 'api-ci', status: 'completed', conclusion: 'cancelled' }],
      }),
    ).rejects.toThrow(/api-ci: cancelled/);
  });

  it('passes when every required check has a successful run', async () => {
    await expect(
      verifyRequiredChecks({
        repository: 'owner/repo',
        sha: 'abc',
        token: 'token',
        requiredChecks: ['api-ci', 'security-ci'],
        timeoutMs: 1,
        pollMs: 1,
        fetchRuns: async () => [
          { name: 'api-ci', status: 'completed', conclusion: 'success' },
          { name: 'security-ci', status: 'completed', conclusion: 'success' },
        ],
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it('uses the newest matching check run instead of any historical success', () => {
    const result = evaluateRequiredChecks(
      [
        {
          name: 'api-ci',
          status: 'completed',
          conclusion: 'success',
          started_at: '2026-06-10T10:00:00Z',
        },
        {
          name: 'api-ci',
          status: 'completed',
          conclusion: 'failure',
          started_at: '2026-06-10T10:05:00Z',
        },
      ],
      ['api-ci'],
    );

    expect(result.success).toBe(false);
    expect(result.failures).toEqual(['api-ci: failure']);
    expect(result.passed).toEqual([]);
  });
});
