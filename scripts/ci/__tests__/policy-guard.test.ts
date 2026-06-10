import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runPolicyGuard } from '../policy-guard';

const sha = '1234567890abcdef1234567890abcdef12345678';

function writeFixture(files: Record<string, string>) {
  const rootDir = join(tmpdir(), `penny-policy-${crypto.randomUUID()}`);
  mkdirSync(join(rootDir, '.github', 'workflows'), { recursive: true });

  const packageJson = {
    scripts: {
      'ci:policy': 'tsx scripts/ci/policy-guard.ts',
      'test:db': 'firebase emulators:exec --only firestore,storage "vitest run database/__tests__"',
      'api:check': 'npm run api:typecheck && npm run api:test && npm run api:build',
      'api:contract': 'tsx scripts/api/generate-openapi.ts --check',
      'mobile:api-only:check': 'tsx scripts/mobile/check-api-only.ts',
      'docs:agents:check': 'tsx scripts/agents/generate-agent-docs.ts --check',
      'docs:agents:lint': 'tsx scripts/agents/lint-agent-docs.ts',
      'docs:agents:test': 'vitest run scripts/agents apps/api/src/routes/__tests__/route-surface.test.ts',
    },
  };

  writeFileSync(join(rootDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(rootDir, relativePath);
    mkdirSync(join(absolutePath, '..'), { recursive: true });
    writeFileSync(absolutePath, content);
  }

  return rootDir;
}

function workflow(name: string, body: string) {
  return `name: ${name}
on:
  pull_request:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${sha}
${body}
`;
}

function requiredWorkflowFixtures(overrides: Record<string, string> = {}) {
  const files: Record<string, string> = {
    '.github/workflows/ci-policy-guard.yml': workflow(
      'CI Policy Guard',
      '      - run: npm run ci:policy\n',
    ),
    '.github/workflows/backend-tests.yml': workflow(
      'Backend Tests',
      '      - run: npm run typecheck\n      - run: npm run build\n      - run: echo "name: backend-tests"\n',
    ),
    '.github/workflows/sast-ci.yml': workflow(
      'SAST CI',
      '      - run: echo "schedule:"\n      - run: echo "name: sast-ci"\n      - run: semgrep scan --config=p/typescript --error\n',
    ),
    '.github/workflows/docs-contract-ci.yml': workflow(
      'Docs and Contracts CI',
      '      - run: npm run docs:agents:check\n      - run: npm run api:contract\n',
    ),
    '.github/workflows/api-ci.yml': workflow(
      'API CI',
      '      - run: npm run api:check\n      - run: npm run api:contract\n      - run: npm run mobile:api-only:check\n',
    ),
    '.github/workflows/api-staging-deploy.yml': workflow(
      'API Staging Deploy',
      `      - run: git merge-base --is-ancestor "$GITHUB_SHA" origin/main\n      - uses: aquasecurity/trivy-action@${sha}\n      - uses: actions/attest-build-provenance@${sha}\n      - run: cosign sign --yes "$IMAGE_WITH_DIGEST"\n      - run: gcloud run deploy --no-traffic\n      - run: npm run api:smoke\n`,
    ),
    '.github/workflows/api-cloud-run-deploy.yml': workflow(
      'Deploy API to Cloud Run',
      `      - run: git merge-base --is-ancestor "$GITHUB_SHA" origin/main\n      - uses: aquasecurity/trivy-action@${sha}\n      - uses: actions/attest-build-provenance@${sha}\n      - run: cosign sign --yes "$IMAGE_WITH_DIGEST"\n      - run: gcloud run deploy --no-traffic\n      - run: npm run api:smoke\n`,
    ),
    '.github/workflows/firebase-rules-ci.yml': workflow(
      'Firebase Rules CI',
      '      - run: npm run test:db\n',
    ),
    '.github/workflows/security-ci.yml': workflow(
      'Security CI',
      `      - run: echo "schedule:"\n      - run: npm audit --omit=dev --audit-level=high\n      - uses: google/osv-scanner-action/osv-scanner-action@${sha}\n      - uses: aquasecurity/trivy-action@${sha}\n`,
    ),
    '.github/workflows/mobile-shared-ci.yml': workflow(
      'Mobile Shared CI',
      '      - run: flutter analyze\n      - run: flutter test\n',
    ),
    '.github/workflows/mobile-android-ci.yml': workflow(
      'Mobile Android CI',
      '      - run: flutter build appbundle\n',
    ),
    '.github/workflows/mobile-ios-ci.yml': workflow(
      'Mobile iOS CI',
      '      - run: flutter test integration_test\n      - run: flutter build ios\n',
    ),
    '.github/workflows/penny-required-gate.yml': workflow(
      'Penny Required Gate',
      '      - run: echo "$REQUIRED_CHECKS backend-tests sast-ci"\n      - run: node scripts/ci/verify-required-checks.cjs\n',
    ),
  };

  return { ...files, ...overrides };
}

describe('runPolicyGuard', () => {
  it('passes when required workflows are fail-closed and actions are pinned', () => {
    const rootDir = writeFixture(requiredWorkflowFixtures());

    expect(runPolicyGuard({ rootDir })).toEqual({ checkedWorkflows: 13 });
  });

  it('rejects swallowed failures and mutable action refs', () => {
    const rootDir = writeFixture(
      requiredWorkflowFixtures({
        '.github/workflows/api-ci.yml': workflow(
          'API CI',
          '      - uses: actions/setup-node@v6\n      - run: npm run api:check || echo "skip"\n      - run: npm run api:contract\n      - run: npm run mobile:api-only:check\n',
        ),
      }),
    );

    expect(() => runPolicyGuard({ rootDir })).toThrow(/swallowing command failures/);
    expect(() => runPolicyGuard({ rootDir })).toThrow(/pin actions to a full commit SHA/);
  });

  it('rejects long-lived Firebase deploy tokens in workflows', () => {
    const rootDir = writeFixture(
      requiredWorkflowFixtures({
        '.github/workflows/firebase-rules-ci.yml': workflow(
          'Firebase Rules CI',
          '      - run: firebase deploy --token "$FIREBASE_TOKEN"\n      - run: npm run test:db\n',
        ),
      }),
    );

    expect(() => runPolicyGuard({ rootDir })).toThrow(/FIREBASE_TOKEN is forbidden/);
  });

  it('rejects mobile analyzer info leniency', () => {
    const rootDir = writeFixture(
      requiredWorkflowFixtures({
        '.github/workflows/mobile-shared-ci.yml': workflow(
          'Mobile Shared CI',
          '      - run: flutter analyze --no-fatal-infos\n      - run: flutter test\n',
        ),
      }),
    );

    expect(() => runPolicyGuard({ rootDir })).toThrow(/no-fatal-infos is forbidden/);
  });

  it('rejects stale or open-ended OSV vulnerability exceptions', () => {
    const now = new Date('2026-06-10T12:00:00.000Z');
    const validRootDir = writeFixture({
      ...requiredWorkflowFixtures(),
      'osv-scanner.toml': `[[IgnoredVulns]]
id = "GHSA-valid"
ignoreUntil = 2026-07-01
reason = "Temporarily accepted transitive dependency issue with tracked upstream remediation."
`,
    });
    expect(runPolicyGuard({ rootDir: validRootDir, now })).toEqual({ checkedWorkflows: 13 });

    const expiredRootDir = writeFixture({
      ...requiredWorkflowFixtures(),
      'osv-scanner.toml': `[[IgnoredVulns]]
id = "GHSA-expired"
ignoreUntil = 2026-06-01
reason = "Temporarily accepted transitive dependency issue with tracked upstream remediation."
`,
    });
    expect(() => runPolicyGuard({ rootDir: expiredRootDir, now })).toThrow(/expired/);

    const longLivedRootDir = writeFixture({
      ...requiredWorkflowFixtures(),
      'osv-scanner.toml': `[[IgnoredVulns]]
id = "GHSA-long-lived"
ignoreUntil = 2026-12-01
reason = "Temporarily accepted transitive dependency issue with tracked upstream remediation."
`,
    });
    expect(() => runPolicyGuard({ rootDir: longLivedRootDir, now })).toThrow(/more than 45 days/);
  });
});
