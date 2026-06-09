import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { apiRouteSurface } from '../api/route-surface';

export interface GeneratedDoc {
  path: string;
  content: string;
}

interface MobileEndpoint {
  symbol: string;
  dartPath: string;
  apiPath: string;
  normalizedApiPath: string;
  source: string;
  callers: string[];
  kind: 'constant' | 'raw-literal';
  method: string;
}

const generatedDocPaths = [
  'docs/agents/FILE_MAP.md',
  'docs/agents/generated/MOBILE_FILE_MAP.md',
  'docs/agents/generated/API_ROUTE_SURFACE.md',
  'docs/agents/generated/MOBILE_API_ENDPOINT_MATRIX.md',
  'docs/agents/generated/VALIDATION_COMMANDS.md',
  'docs/agents/generated/DOCS_FRESHNESS_MANIFEST.json',
] as const;

const watchPaths = [
  'mobile/**',
  'apps/api/**',
  'packages/shared/**',
  'scripts/api/**',
  'scripts/agents/**',
  'src/app/api/**',
  'src/lib/types.ts',
  'src/lib/types/**',
  'src/lib/categories.ts',
  'database/**',
  '.github/workflows/**',
  'package.json',
  'package-lock.json',
  'tsconfig.api.json',
  'Dockerfile.api',
  'docs/agents/**',
  'docs/api/**',
] as const;

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
}

function toRepoPath(path: string) {
  return path.replaceAll('\\', '/');
}

function gitFiles(rootDir: string, pathspecs: string[]) {
  const files = new Set<string>();
  for (const args of [
    ['ls-files', '--', ...pathspecs],
    ['ls-files', '--others', '--exclude-standard', '--', ...pathspecs],
  ]) {
    const output = execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
    });
    for (const line of output.split('\n')) {
      const file = line.trim();
      if (file) files.add(toRepoPath(file));
    }
  }
  return [...files].sort();
}

function readText(rootDir: string, relativePath: string) {
  return readFileSync(join(rootDir, relativePath), 'utf8');
}

function packageScripts(rootDir: string) {
  const pkg = JSON.parse(readText(rootDir, 'package.json')) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts ?? {};
}

function allSourceFiles(rootDir: string) {
  return gitFiles(rootDir, ['.']).filter(
    (file) =>
      !file.startsWith('node_modules/') &&
      !file.startsWith('.next/') &&
      !file.startsWith('dist/') &&
      !file.startsWith('build/'),
  );
}

function pathExists(rootDir: string, relativePath: string) {
  return existsSync(join(rootDir, relativePath));
}

function routeSource(path: string) {
  if (path === '/api/healthz' || path === '/api/readyz') {
    return 'apps/api/src/app.ts';
  }
  if (
    path === '/api/ai-chat' ||
    path === '/api/analyze-expense' ||
    path === '/api/conversations/{conversationId}/generate-title'
  ) {
    return 'apps/api/src/routes/ai/routes.ts';
  }
  if (path.startsWith('/api/expenses')) {
    return path.includes('/approve') ||
      path.includes('/reject') ||
      path.includes('/duplicate-check')
      ? 'apps/api/src/routes/mobile-data/routes.ts'
      : 'apps/api/src/routes/expenses/routes.ts';
  }
  if (
    path.includes('/activities') ||
    path.includes('/membership/me') ||
    path.includes('/invitations/{id}/decline')
  ) {
    return 'apps/api/src/routes/mobile-data/routes.ts';
  }
  if (path.startsWith('/api/groups')) {
    return 'apps/api/src/routes/groups/routes.ts';
  }
  if (
    path.startsWith('/api/income') ||
    path.startsWith('/api/savings') ||
    path.startsWith('/api/notifications') ||
    path.startsWith('/api/notification-') ||
    path.startsWith('/api/push-tokens') ||
    path.startsWith('/api/media') ||
    path === '/api/user/profile' ||
    path === '/api/user/preferences'
  ) {
    return 'apps/api/src/routes/mobile-data/routes.ts';
  }
  if (path.startsWith('/api/budgets')) {
    return 'apps/api/src/routes/budgets/routes.ts';
  }
  if (path.startsWith('/api/conversations')) {
    return 'apps/api/src/routes/conversations/routes.ts';
  }
  if (path.startsWith('/api/user') || path.startsWith('/api/account')) {
    return 'apps/api/src/routes/user/routes.ts';
  }
  if (path.startsWith('/api/privacy') || path.startsWith('/api/cron')) {
    return 'apps/api/src/routes/compat/routes.ts';
  }
  return 'apps/api/src/app.ts';
}

function routeStatus(method: string, path: string) {
  if (path === '/api/privacy/delete-my-data' || path === '/api/cron/store-metrics') {
    return 'compatibility placeholder';
  }
  if (method === 'GET' && path === '/api/analyze-expense') {
    return 'method guard: returns 405';
  }
  return 'implemented';
}

function normalizeApiEndpoint(symbol: string, dartPath: string) {
  if (symbol === 'groupById') return '/api/groups/{groupId}';
  if (symbol === 'groupActivities') return '/api/groups/{groupId}/activities';
  if (symbol === 'myGroupMembership') return '/api/groups/{groupId}/membership/me';
  if (symbol === 'groupMembers') return '/api/groups/{groupId}/members';
  if (symbol === 'groupLeave') return '/api/groups/{groupId}/leave';
  if (symbol === 'declineInvitation') {
    return '/api/groups/invitations/{id}/decline';
  }
  if (symbol === 'expenseById') return '/api/expenses/{id}';
  if (symbol === 'approveExpense') return '/api/expenses/{id}/approve';
  if (symbol === 'rejectExpense') return '/api/expenses/{id}/reject';
  if (symbol === 'personalBudgetById') return '/api/budgets/personal/{id}';
  if (symbol === 'groupBudgetById') return '/api/budgets/group/{id}';
  if (symbol === 'personalIncomeById') return '/api/income/personal/{id}';
  if (symbol === 'groupIncomeById') return '/api/income/group/{id}';
  if (symbol === 'personalSavingsById') return '/api/savings/personal/{id}';
  if (symbol === 'personalSavingsContribution') {
    return '/api/savings/personal/{id}/contributions';
  }
  if (symbol === 'groupSavingsById') return '/api/savings/group/{id}';
  if (symbol === 'groupSavingsContribution') {
    return '/api/savings/group/{id}/contributions';
  }
  if (symbol === 'conversationById') return '/api/conversations/{conversationId}';
  if (symbol === 'conversationMessages') {
    return '/api/conversations/{conversationId}/messages';
  }
  if (symbol === 'generateConversationTitle') {
    return '/api/conversations/{conversationId}/generate-title';
  }
  if (symbol === 'notificationRead') return '/api/notifications/{id}/read';
  if (symbol === 'pushToken') return '/api/push-tokens/{deviceId}';
  return dartPath.replaceAll('$id', '{id}');
}

function routeSurfaceLookup() {
  const sourceByPath = new Map<string, string>();
  for (const route of apiRouteSurface) {
    sourceByPath.set(route.path, routeSource(route.path));
  }
  return sourceByPath;
}

function mobileEndpointCallers(rootDir: string, symbol: string) {
  const files = gitFiles(rootDir, ['mobile/lib']);
  return files
    .filter((file) => file.endsWith('.dart'))
    .filter((file) => readText(rootDir, file).includes(`ApiEndpoints.${symbol}`));
}

function normalizeMobileApiPath(path: string) {
  return path
    .replace(/\$\{[^}]*expense\.id\}/g, '{id}')
    .replace(/\$\{[^}]*widget\.expense\.id\}/g, '{id}')
    .replace(/\$\{[^}]*\.id\}/g, '{id}')
    .replace(/\$memberId/g, '{memberId}')
    .replace(/\$groupId/g, '{groupId}')
    .replace(/\$id/g, '{id}');
}

function rawMobileApiLiterals(rootDir: string): MobileEndpoint[] {
  const files = gitFiles(rootDir, ['mobile/lib']).filter((file) =>
    file.endsWith('.dart'),
  );
  const endpoints = new Map<string, MobileEndpoint>();
  for (const file of files) {
    if (file === 'mobile/lib/core/network/api_endpoints.dart') continue;
    const content = readText(rootDir, file);
    const lines = content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trimStart().startsWith('//')) continue;
      for (const match of line.matchAll(/(['"`])(\/api\/[^'"`]+)\1/g)) {
        const literal = match[2];
        const normalizedApiPath = normalizeMobileApiPath(literal.split('?')[0]);
        const context = lines
          .slice(Math.max(0, index - 4), index + 1)
          .join('\n');
        const methodMatch = context.match(
          /\.(get|post|patch|put|delete)\s*(?:<[^>]+>)?\s*\(/,
        );
        const method = methodMatch?.[1]?.toUpperCase() ?? 'UNKNOWN';
        const key = `${method} ${literal} ${file}`;
        endpoints.set(key, {
          symbol: `raw:${literal}`,
          dartPath: literal,
          apiPath: literal,
          normalizedApiPath,
          source: routeSource(normalizedApiPath),
          callers: [`${file}:${index + 1}`],
          kind: 'raw-literal',
          method,
        });
      }
    }
  }
  return [...endpoints.values()].sort((a, b) =>
    `${a.method} ${a.apiPath}`.localeCompare(`${b.method} ${b.apiPath}`),
  );
}

function parseMobileEndpoints(rootDir: string): MobileEndpoint[] {
  const source = readText(rootDir, 'mobile/lib/core/network/api_endpoints.dart');
  const endpoints: MobileEndpoint[] = [];
  const sourceByPath = routeSurfaceLookup();

  for (const match of source.matchAll(/static const (\w+) = '([^']+)';/g)) {
    const [, symbol, dartPath] = match;
    const normalizedApiPath = normalizeApiEndpoint(symbol, dartPath);
    endpoints.push({
      symbol,
      dartPath,
      apiPath: dartPath,
      normalizedApiPath,
      source: sourceByPath.get(normalizedApiPath) ?? routeSource(normalizedApiPath),
      callers: mobileEndpointCallers(rootDir, symbol),
      kind: 'constant',
      method: 'varies',
    });
  }

  for (const match of source.matchAll(
    /static String (\w+)\([^)]*\)\s*=>\s*'([^']+)';/g,
  )) {
    const [, symbol, dartPath] = match;
    const normalizedApiPath = normalizeApiEndpoint(symbol, dartPath);
    endpoints.push({
      symbol,
      dartPath,
      apiPath: dartPath,
      normalizedApiPath,
      source: sourceByPath.get(normalizedApiPath) ?? routeSource(normalizedApiPath),
      callers: mobileEndpointCallers(rootDir, symbol),
      kind: 'constant',
      method: 'varies',
    });
  }

  return [...endpoints, ...rawMobileApiLiterals(rootDir)].sort((a, b) =>
    `${a.kind} ${a.symbol}`.localeCompare(`${b.kind} ${b.symbol}`),
  );
}

function renderFileList(files: string[]) {
  return files.map((file) => `- \`${file}\``).join('\n');
}

function fileCategory(file: string) {
  if (file.startsWith('mobile/')) return 'mobile';
  if (file.startsWith('apps/api/')) return 'standalone-api';
  if (file.startsWith('src/')) return 'web-next';
  if (file.startsWith('database/')) return 'firebase';
  if (file.startsWith('docs/agents/')) return 'agent-docs';
  if (file.startsWith('docs/')) return 'docs';
  if (file.startsWith('.github/workflows/')) return 'workflow';
  if (file.startsWith('scripts/')) return 'script';
  if (file.startsWith('packages/')) return 'shared-package';
  return 'repo';
}

function renderRepositoryFileMap(rootDir: string) {
  const files = allSourceFiles(rootDir);
  const rows = files
    .map((file) => `| \`${file}\` | ${fileCategory(file)} |`)
    .join('\n');

  return `# Generated Repository File Map

> Generated by \`npm run docs:agents:generate\`. Do not edit by hand.

This inventory includes every tracked file plus every nonignored untracked file visible to Git at generation time. It is intentionally path-focused for agent navigation and does not reproduce generated Firebase config values or secret-bearing file contents.

- Total source-visible files: ${files.length}

| Path | Area |
|---|---|
${rows}
`;
}

function renderMobileFileMap(rootDir: string) {
  const files = gitFiles(rootDir, [
    'mobile/lib',
    'mobile/test',
    'mobile/integration_test',
    'mobile/android',
    'mobile/ios',
    'mobile/pubspec.yaml',
    'mobile/pubspec.lock',
    'mobile/.flutter-version',
    'mobile/Gemfile',
    'mobile/Gemfile.lock',
    'mobile/CICD.md',
    'mobile/PRODUCTION_READINESS.md',
    'mobile/fastlane',
  ]);
  const section = (title: string, prefix: string) => {
    const matches = files.filter((file) => file.startsWith(prefix));
    return `## ${title}\n\n${matches.length ? renderFileList(matches) : '_No files found._'}\n`;
  };
  const exactSection = (title: string, exactFiles: string[]) => {
    const matches = files.filter((file) => exactFiles.includes(file));
    return `## ${title}\n\n${matches.length ? renderFileList(matches) : '_No files found._'}\n`;
  };

  return `# Generated Mobile File Map

> Generated by \`npm run docs:agents:generate\`. Do not edit by hand.

This inventory is scoped to the active Flutter mobile app and mobile release tooling. It includes tracked files plus nonignored untracked files visible to Git at generation time.

- Total mobile files: ${files.length}
- Current source layout: \`mobile/lib/core\`, \`mobile/lib/data\`, \`mobile/lib/domain\`, and \`mobile/lib/presentation\`
- Stale layout warning: the old feature-module tree is not part of the current mobile source layout.

${exactSection('Entrypoints', [
  'mobile/lib/main.dart',
  'mobile/lib/app.dart',
  'mobile/lib/firebase_options.dart',
])}
${section('Core', 'mobile/lib/core')}
${section('Data Models, Repositories, and Services', 'mobile/lib/data')}
${section('Domain Layer', 'mobile/lib/domain')}
${section('Presentation Layer', 'mobile/lib/presentation')}
${section('Unit and Widget Tests', 'mobile/test')}
${section('Integration Tests', 'mobile/integration_test')}
${section('Native Android', 'mobile/android')}
${section('Native iOS', 'mobile/ios')}
${section('Release and Tooling', 'mobile/fastlane')}
## Root Mobile Config

${renderFileList(
  files.filter((file) =>
    [
      'mobile/pubspec.yaml',
      'mobile/pubspec.lock',
      'mobile/.flutter-version',
      'mobile/Gemfile',
      'mobile/Gemfile.lock',
      'mobile/CICD.md',
      'mobile/PRODUCTION_READINESS.md',
    ].includes(file),
  ),
)}
`;
}

function renderApiRouteSurface() {
  const rows = apiRouteSurface
    .map(
      (route) =>
        `| ${route.method} | \`${route.path}\` | ${route.auth} | ${routeStatus(route.method, route.path)} | \`${routeSource(route.path)}\` |`,
    )
    .join('\n');

  return `# Generated API Route Surface

> Generated by \`npm run docs:agents:generate\`. Do not edit by hand.

Standalone Fastify API source: \`apps/api/src/app.ts\`.
Route contract source: \`scripts/api/route-surface.ts\`.
OpenAPI artifact: \`docs/api/openapi.json\`.

| Method | Path | Auth | Status | Implementation |
|---|---|---|---|---|
${rows}
`;
}

function renderEndpointMatrix(rootDir: string) {
  const rows = parseMobileEndpoints(rootDir)
    .map((endpoint) => {
      const callers = endpoint.callers.length
        ? endpoint.callers.map((caller) => `\`${caller}\``).join('<br>')
        : '_No current mobile caller found._';
      const symbol =
        endpoint.kind === 'constant'
          ? `\`ApiEndpoints.${endpoint.symbol}\``
          : `\`${endpoint.symbol}\``;
      return `| ${endpoint.kind} | ${symbol} | ${endpoint.method} | \`${endpoint.apiPath}\` | \`${endpoint.normalizedApiPath}\` | \`${endpoint.source}\` | ${callers} |`;
    })
    .join('\n');

  return `# Generated Mobile API Endpoint Matrix

> Generated by \`npm run docs:agents:generate\`. Do not edit by hand.

Mobile endpoint constants live in \`mobile/lib/core/network/api_endpoints.dart\`.
HTTP calls go through \`mobile/lib/core/network/api_client.dart\`, which injects the current Firebase ID token as \`Authorization: Bearer <token>\` when a user is signed in.

| Kind | Mobile Symbol or Literal | Method | Dart Path | Standalone API Path | API Implementation | Mobile Callers |
|---|---|---|---|---|---|---|
${rows}
`;
}

function renderValidationCommands(rootDir: string) {
  const scripts = packageScripts(rootDir);
  const selectedScripts = [
    'mobile:api-only:check',
    'docs:agents:generate',
    'docs:agents:check',
    'docs:agents:lint',
    'docs:agents:test',
    'api:contract',
    'api:check',
    'api:typecheck',
    'api:test',
    'api:build',
    'typecheck',
    'lint',
    'test',
    'build',
  ].filter((script) => scripts[script]);

  return `# Generated Validation Commands

> Generated by \`npm run docs:agents:generate\`. Do not edit by hand.

Use the smallest command set that proves the change. Mobile/API agent-doc changes should at least run the docs freshness checks.

## Package Scripts

${selectedScripts.map((script) => `- \`npm run ${script}\` -> \`${scripts[script]}\``).join('\n')}

## Mobile Commands

- \`cd mobile && flutter pub get\`
- \`cd mobile && flutter analyze lib --no-fatal-infos\`
- \`cd mobile && flutter test\`
- \`cd mobile && flutter test integration_test\`
- \`npm run mobile:api-only:check\`

## Standalone API Commands

- \`npm run api:check\`
- \`npm run api:contract\`
- \`API_BASE_URL=https://YOUR-CLOUD-RUN-URL npm run api:smoke\`
- \`OLD_API_BASE_URL=https://YOUR-NEXT-APP NEW_API_BASE_URL=https://YOUR-CLOUD-RUN-URL npm run api:parity\`
`;
}

function renderFreshnessManifest(rootDir: string) {
  const scripts = packageScripts(rootDir);
  const manifest = {
    generatedBy: 'scripts/agents/generate-agent-docs.ts',
    generatedDocs: generatedDocPaths,
    watchPaths,
    sourceOfTruth: {
      mobile: [
        'mobile/lib',
        'mobile/pubspec.yaml',
        'mobile/.flutter-version',
        'mobile/lib/core/network/api_endpoints.dart',
        'mobile/lib/core/constants/env_config.dart',
      ],
      api: [
        'apps/api/src/app.ts',
        'apps/api/src/routes',
        'apps/api/src/services',
        'scripts/api/route-surface.ts',
        'docs/api/openapi.json',
        'Dockerfile.api',
        '.github/workflows/api-cloud-run-deploy.yml',
      ],
      contracts: [
        'src/lib/types.ts',
        'src/lib/types/**',
        'packages/shared/src/categories.ts',
        'src/lib/categories.ts',
        'mobile/lib/data/models/*.dart',
        'database/firestore.rules',
        'database/firestore.indexes.json',
      ],
    },
    packageScripts: Object.fromEntries(
      Object.entries(scripts).filter(([name]) =>
        [
          'docs:agents:generate',
          'docs:agents:check',
          'docs:agents:lint',
          'docs:agents:test',
          'api:contract',
          'api:check',
          'api:typecheck',
          'api:test',
          'api:build',
        ].includes(name),
      ),
    ),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function generateAgentDocs(rootDir = repoRoot()): GeneratedDoc[] {
  return [
    {
      path: 'docs/agents/FILE_MAP.md',
      content: renderRepositoryFileMap(rootDir),
    },
    {
      path: 'docs/agents/generated/MOBILE_FILE_MAP.md',
      content: renderMobileFileMap(rootDir),
    },
    {
      path: 'docs/agents/generated/API_ROUTE_SURFACE.md',
      content: renderApiRouteSurface(),
    },
    {
      path: 'docs/agents/generated/MOBILE_API_ENDPOINT_MATRIX.md',
      content: renderEndpointMatrix(rootDir),
    },
    {
      path: 'docs/agents/generated/VALIDATION_COMMANDS.md',
      content: renderValidationCommands(rootDir),
    },
    {
      path: 'docs/agents/generated/DOCS_FRESHNESS_MANIFEST.json',
      content: renderFreshnessManifest(rootDir),
    },
  ];
}

function writeDocs(docs: GeneratedDoc[], rootDir: string) {
  for (const doc of docs) {
    const outputPath = join(rootDir, doc.path);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, doc.content);
    console.log(`Wrote ${doc.path}`);
  }
}

function checkDocs(docs: GeneratedDoc[], rootDir: string) {
  const staleDocs: string[] = [];
  for (const doc of docs) {
    const outputPath = join(rootDir, doc.path);
    if (!pathExists(rootDir, doc.path) || readFileSync(outputPath, 'utf8') !== doc.content) {
      staleDocs.push(doc.path);
    }
  }

  if (staleDocs.length > 0) {
    throw new Error(
      `Agent docs are out of date. Run npm run docs:agents:generate. Stale files: ${staleDocs.join(', ')}`,
    );
  }

  console.log('Agent docs are up to date.');
}

function main() {
  const rootDir = repoRoot();
  const docs = generateAgentDocs(rootDir);
  if (process.argv.includes('--check')) {
    checkDocs(docs, rootDir);
    return;
  }
  writeDocs(docs, rootDir);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  main();
}
