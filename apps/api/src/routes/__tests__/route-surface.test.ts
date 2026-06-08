import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { apiRouteSurface } from '../../../../../scripts/api/route-surface';
import { buildApiApp } from '../../app';

type RouteSurfaceEntry = (typeof apiRouteSurface)[number];

const sampleValues: Record<string, string> = {
  id: 'budget-1',
  groupId: 'group-1',
  memberId: 'member-1',
  conversationId: 'conversation-1',
};

function materializePath(route: RouteSurfaceEntry) {
  return route.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = sampleValues[name];
    if (!value) throw new Error(`No sample value for route param ${name}`);
    return value;
  });
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.ts') && !path.includes('__tests__') ? [path] : [];
  });
}

function normalizeRegisteredPath(path: string) {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function registeredRoutesFromSource() {
  const routeFiles = [
    join(process.cwd(), 'apps/api/src/app.ts'),
    ...walk(join(process.cwd(), 'apps/api/src/routes')),
  ];
  const routes = new Set<string>();
  for (const file of routeFiles) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(
      /app\.(get|post|patch|put|delete)\(\s*['"`]([^'"`]+)['"`]/g,
    )) {
      routes.add(`${match[1].toUpperCase()} ${normalizeRegisteredPath(match[2])}`);
    }
  }
  return routes;
}

describe('container API route surface', () => {
  it.each(apiRouteSurface)(
    '$method $path is registered in the Fastify app',
    async (route) => {
      const app = await buildApiApp({ readyCheck: async () => undefined });
      const response = await app.inject({
        method: route.method,
        url: materializePath(route),
      });

      expect(response.statusCode, `${route.method} ${route.path}`).not.toBe(404);

      await app.close();
    },
  );

  it('matches route definitions in source modules', () => {
    const registeredRoutes = registeredRoutesFromSource();
    const documentedRoutes = new Set(
      apiRouteSurface.map((route) => `${route.method} ${route.path}`),
    );

    expect([...registeredRoutes].sort()).toEqual([...documentedRoutes].sort());
  });
});
