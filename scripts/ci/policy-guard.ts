import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

export type PolicyGuardOptions = {
  rootDir?: string;
  now?: Date;
};

type RequiredWorkflow = {
  file: string;
  requiredText: string[];
};

const defaultRootDir = process.cwd();

const requiredWorkflows: RequiredWorkflow[] = [
  {
    file: 'ci-policy-guard.yml',
    requiredText: ['name: CI Policy Guard', 'npm run ci:policy'],
  },
  {
    file: 'backend-tests.yml',
    requiredText: ['name: Backend Tests', 'name: backend-tests', 'npm run typecheck', 'npm run build'],
  },
  {
    file: 'sast-ci.yml',
    requiredText: ['name: SAST CI', 'name: sast-ci', 'schedule:', 'semgrep scan'],
  },
  {
    file: 'docs-contract-ci.yml',
    requiredText: ['name: Docs and Contracts CI', 'npm run docs:agents:check', 'npm run api:contract'],
  },
  {
    file: 'api-ci.yml',
    requiredText: ['name: API CI', 'npm run api:check', 'npm run api:contract', 'npm run mobile:api-only:check'],
  },
  {
    file: 'api-staging-deploy.yml',
    requiredText: [
      'name: API Staging Deploy',
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
      'trivy-action',
      'attest-build-provenance',
      'cosign sign --yes',
      '--no-traffic',
      'npm run api:smoke',
    ],
  },
  {
    file: 'api-cloud-run-deploy.yml',
    requiredText: [
      'name: Deploy API to Cloud Run',
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
      'trivy-action',
      'attest-build-provenance',
      'cosign sign --yes',
      '--no-traffic',
      'npm run api:smoke',
    ],
  },
  {
    file: 'firebase-rules-ci.yml',
    requiredText: ['name: Firebase Rules CI', 'npm run test:db'],
  },
  {
    file: 'security-ci.yml',
    requiredText: [
      'name: Security CI',
      'schedule:',
      'npm audit --omit=dev --audit-level=high',
      'osv-scanner-action/osv-scanner-action',
      'trivy-action',
    ],
  },
  {
    file: 'mobile-shared-ci.yml',
    requiredText: ['name: Mobile Shared CI', 'flutter analyze', 'flutter test'],
  },
  {
    file: 'mobile-android-ci.yml',
    requiredText: ['name: Mobile Android CI', 'flutter build appbundle'],
  },
  {
    file: 'mobile-ios-ci.yml',
    requiredText: ['name: Mobile iOS CI', 'integration_test', 'flutter build ios'],
  },
  {
    file: 'penny-required-gate.yml',
    requiredText: [
      'name: Penny Required Gate',
      'REQUIRED_CHECKS',
      'node scripts/ci/verify-required-checks.cjs',
      'backend-tests',
      'sast-ci',
    ],
  },
];

const forbiddenWorkflowPatterns: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /^\s*continue-on-error:\s*true\s*$/im,
    message: 'continue-on-error:true is forbidden in required CI because it hides failures',
  },
  {
    pattern: /\|\|\s*(true|:|echo)\b/,
    message: 'swallowing command failures with || true, || :, or || echo is forbidden',
  },
  {
    pattern: /^\s*set\s+\+e\s*$/im,
    message: 'set +e is forbidden in workflows because it makes failures ambiguous',
  },
  {
    pattern: /\bFIREBASE_TOKEN\b/,
    message: 'FIREBASE_TOKEN is forbidden in workflows; use OIDC or short-lived cloud credentials',
  },
  {
    pattern: /pull_request_target\s*:/,
    message: 'pull_request_target is forbidden for this repo CI surface',
  },
  {
    pattern: /flutter\s+analyze\s+--no-fatal-infos/,
    message: 'flutter analyze --no-fatal-infos is forbidden; mobile analyzer infos must fail CI',
  },
];

const fullShaPattern = /^[0-9a-f]{40}$/i;
const maxOsvExceptionDays = 45;

function readJson(relativePath: string, rootDir: string) {
  return JSON.parse(readFileSync(join(rootDir, relativePath), 'utf8'));
}

function workflowFiles(rootDir: string) {
  const workflowDir = join(rootDir, '.github', 'workflows');
  return readdirSync(workflowDir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file) => join(workflowDir, file));
}

function checkActionPins(relativePath: string, content: string, failures: string[]) {
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    const match = line.match(/uses:\s*([^@\s]+)@([^\s#]+)/);
    if (!match) return;

    const ref = match[2].trim();
    if (!fullShaPattern.test(ref)) {
      failures.push(
        `${relativePath}:${index + 1} uses ${match[1]}@${ref}; pin actions to a full commit SHA`,
      );
    }
  });
}

function utcDateOnly(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function readTomlString(block: string, field: string) {
  const match = block.match(new RegExp(`^\\s*${field}\\s*=\\s*"([^"]+)"\\s*$`, 'm'));
  return match?.[1];
}

function readTomlDate(block: string, field: string) {
  const match = block.match(
    new RegExp(`^\\s*${field}\\s*=\\s*"?([0-9]{4}-[0-9]{2}-[0-9]{2})"?\\s*$`, 'm'),
  );
  return match?.[1];
}

function checkOsvExceptionLedger(rootDir: string, now: Date, failures: string[]) {
  const relativePath = 'osv-scanner.toml';
  const absolutePath = join(rootDir, relativePath);
  if (!existsSync(absolutePath)) {
    return;
  }

  const blocks = readFileSync(absolutePath, 'utf8')
    .split(/\[\[IgnoredVulns\]\]/)
    .slice(1);

  if (blocks.length === 0) {
    failures.push(`${relativePath} exists but does not declare any [[IgnoredVulns]] entries`);
    return;
  }

  const todayUtc = utcDateOnly(now);
  const maxUntilUtc = todayUtc + maxOsvExceptionDays * 24 * 60 * 60 * 1000;

  blocks.forEach((block, index) => {
    const id = readTomlString(block, 'id');
    const ignoreUntil = readTomlDate(block, 'ignoreUntil');
    const reason = readTomlString(block, 'reason');
    const entryName = `${relativePath} IgnoredVulns[${index + 1}]`;

    if (!id) {
      failures.push(`${entryName} must include an id`);
    }
    if (!reason || reason.trim().length < 20) {
      failures.push(`${entryName} must include a specific reason of at least 20 characters`);
    }
    if (!ignoreUntil) {
      failures.push(`${entryName} must include ignoreUntil`);
      return;
    }

    const untilUtc = Date.parse(`${ignoreUntil}T00:00:00.000Z`);
    if (!Number.isFinite(untilUtc)) {
      failures.push(`${entryName} has invalid ignoreUntil ${ignoreUntil}`);
      return;
    }
    if (untilUtc < todayUtc) {
      failures.push(`${entryName} expired on ${ignoreUntil}`);
    }
    if (untilUtc > maxUntilUtc) {
      failures.push(
        `${entryName} ignoreUntil ${ignoreUntil} is more than ${maxOsvExceptionDays} days away`,
      );
    }
  });
}

function checkWorkflowPermissions(relativePath: string, content: string, failures: string[]) {
  if (!content.includes('permissions:')) {
    failures.push(`${relativePath} must declare least-privilege permissions explicitly`);
  }

  if (/contents:\s*write/.test(content)) {
    failures.push(`${relativePath} grants contents:write; CI workflows must not write repository contents`);
  }
}

function checkRequiredWorkflows(rootDir: string, failures: string[]) {
  for (const workflow of requiredWorkflows) {
    const relativePath = `.github/workflows/${workflow.file}`;
    const absolutePath = join(rootDir, relativePath);
    if (!existsSync(absolutePath)) {
      failures.push(`${relativePath} is missing`);
      continue;
    }

    const content = readFileSync(absolutePath, 'utf8');
    for (const requiredText of workflow.requiredText) {
      if (!content.includes(requiredText)) {
        failures.push(`${relativePath} must contain ${JSON.stringify(requiredText)}`);
      }
    }
  }
}

function checkPackageScripts(rootDir: string, failures: string[]) {
  const packageJson = readJson('package.json', rootDir);
  const scripts = packageJson.scripts ?? {};
  const requiredScripts = [
    'ci:policy',
    'test:db',
    'api:check',
    'api:contract',
    'mobile:api-only:check',
    'docs:agents:check',
    'docs:agents:lint',
    'docs:agents:test',
  ];

  for (const script of requiredScripts) {
    if (typeof scripts[script] !== 'string' || scripts[script].trim() === '') {
      failures.push(`package.json is missing required script ${script}`);
    }
  }

  for (const [name, command] of Object.entries<string>(scripts)) {
    if (/\|\|\s*(true|:|echo)\b/.test(command)) {
      failures.push(`package.json script ${name} swallows failures with ${command}`);
    }
  }
}

export function runPolicyGuard(options: PolicyGuardOptions = {}) {
  const rootDir = options.rootDir ?? defaultRootDir;
  const failures: string[] = [];

  checkRequiredWorkflows(rootDir, failures);
  checkPackageScripts(rootDir, failures);
  checkOsvExceptionLedger(rootDir, options.now ?? new Date(), failures);

  for (const absolutePath of workflowFiles(rootDir)) {
    const relativePath = `.github/workflows/${basename(absolutePath)}`;
    const content = readFileSync(absolutePath, 'utf8');

    for (const { pattern, message } of forbiddenWorkflowPatterns) {
      if (pattern.test(content)) {
        failures.push(`${relativePath}: ${message}`);
      }
    }

    checkActionPins(relativePath, content, failures);
    checkWorkflowPermissions(relativePath, content, failures);
  }

  if (failures.length > 0) {
    throw new Error(`CI policy guard failed:\n${failures.join('\n')}`);
  }

  return { checkedWorkflows: workflowFiles(rootDir).length };
}

if (process.argv[1]?.endsWith('policy-guard.ts')) {
  const result = runPolicyGuard();
  console.log(`CI policy guard passed for ${result.checkedWorkflows} workflow files.`);
}
