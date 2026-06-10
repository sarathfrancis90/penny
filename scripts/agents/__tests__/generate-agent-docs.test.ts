import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { apiRouteSurface } from '../../api/route-surface';
import { generateAgentDocs } from '../generate-agent-docs';

describe('agent documentation generator', () => {
  it('renders generated docs for the active mobile and standalone API surface', () => {
    const docs = generateAgentDocs();
    const byPath = new Map(docs.map((doc) => [doc.path, doc.content]));

    expect(byPath.get('docs/agents/generated/MOBILE_FILE_MAP.md')).toContain(
      'mobile/lib/data/repositories/expense_repository.dart',
    );
    expect(byPath.get('docs/agents/generated/MOBILE_FILE_MAP.md')).toContain(
      'mobile/lib/main.dart',
    );
    expect(byPath.get('docs/agents/generated/MOBILE_FILE_MAP.md')).toContain(
      'mobile/integration_test/full_journey_test.dart',
    );
    expect(byPath.get('docs/agents/generated/MOBILE_FILE_MAP.md')).not.toContain(
      'mobile/lib/features/',
    );
    const trackedDomainFiles = execFileSync(
      'git',
      ['ls-files', 'mobile/lib/domain'],
      { encoding: 'utf8' },
    ).trim();
    if (!trackedDomainFiles) {
      expect(byPath.get('docs/agents/generated/MOBILE_FILE_MAP.md')).not.toContain(
        'mobile/lib/domain',
      );
    }
    expect(byPath.get('docs/agents/FILE_MAP.md')).toContain(
      'scripts/agents/generate-agent-docs.ts',
    );

    const apiRouteSurfaceDoc = byPath.get(
      'docs/agents/generated/API_ROUTE_SURFACE.md',
    );
    expect(apiRouteSurfaceDoc).toContain('Standalone Fastify API');
    for (const route of apiRouteSurface) {
      expect(apiRouteSurfaceDoc).toContain(`| ${route.method} | \`${route.path}\``);
    }

    const endpointMatrix = byPath.get(
      'docs/agents/generated/MOBILE_API_ENDPOINT_MATRIX.md',
    );
    expect(endpointMatrix).toContain('`ApiEndpoints.aiChat`');
    expect(endpointMatrix).toContain('`raw:/api/account/delete`');
    expect(endpointMatrix).toContain('`/api/expenses/{id}`');
    expect(endpointMatrix).toContain('apps/api/src/routes/ai/routes.ts');

    const manifest = JSON.parse(
      byPath.get('docs/agents/generated/DOCS_FRESHNESS_MANIFEST.json') ?? '{}',
    );
    expect(manifest.generatedDocs).toContain(
      'docs/agents/generated/API_ROUTE_SURFACE.md',
    );
    expect(manifest.generatedDocs).toContain('docs/agents/FILE_MAP.md');
    expect(manifest.watchPaths).toContain('apps/api/**');
    expect(manifest.watchPaths).toContain('src/lib/types.ts');
    expect(manifest.watchPaths).toContain('src/lib/types/**');
    expect(manifest.sourceOfTruth.contracts).toContain('src/lib/types.ts');
    expect(manifest.sourceOfTruth.contracts).toContain('src/lib/types/**');
    expect(manifest.sourceOfTruth.contracts).toContain(
      'mobile/lib/data/models/*.dart',
    );
    expect(manifest.packageScripts).toMatchObject({
      'docs:agents:check': expect.any(String),
      'docs:auto': expect.any(String),
      'api:contract:generate': expect.any(String),
    });
    const docsWorkflow = readFileSync('.github/workflows/agent-docs.yml', 'utf8');
    const contractWorkflow = readFileSync(
      '.github/workflows/docs-contract-ci.yml',
      'utf8',
    );
    expect(docsWorkflow).toContain('npm run docs:agents:check');
    expect(docsWorkflow).toContain('npm run docs:agents:lint');
    expect(contractWorkflow).toContain('npm run api:contract');
    expect(contractWorkflow).toContain('npm run docs:agents:check');
  });

  it('wires local auto-refresh and check-only CI', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts).toMatchObject({
      'api:contract:generate': 'tsx scripts/api/generate-openapi.ts',
      'docs:auto': 'tsx scripts/agents/auto-update-agent-docs.ts',
    });

    const preCommit = readFileSync('.githooks/pre-commit', 'utf8');
    expect(preCommit).toContain('npm run docs:auto');
    expect(preCommit).toContain('git diff --quiet --');

    const prePush = readFileSync('.githooks/pre-push', 'utf8');
    expect(prePush).toContain('npm run docs:agents:check');
    expect(prePush).toContain('npm run api:contract');

    const workflow = readFileSync('.github/workflows/agent-docs.yml', 'utf8');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('npm run docs:agents:check');
    expect(workflow).toContain('npm run docs:agents:lint');
    expect(workflow).toContain('npm run docs:agents:test');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('pull-requests: write');
    expect(workflow).not.toContain('npm run docs:auto');
    expect(workflow).not.toContain('git push');
  });
});
