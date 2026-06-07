import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { apiRouteSurface } from './route-surface';

const outputPath = resolve('docs/api/openapi.json');
const check = process.argv.includes('--check');

const paths: Record<string, Record<string, unknown>> = {};

for (const route of apiRouteSurface) {
  paths[route.path] ??= {};
  paths[route.path][route.method.toLowerCase()] = {
    summary: `${route.method} ${route.path}`,
    security:
      route.auth === 'firebase'
        ? [{ firebaseBearer: [] }]
        : route.auth === 'cron'
          ? [{ cronBearer: [] }]
          : [],
    responses: {
      '200': { description: 'Successful response' },
      '400': { description: 'Bad request' },
      '401': { description: 'Unauthorized' },
      '403': { description: 'Forbidden' },
      '500': { description: 'Server error' },
    },
  };
}

const document = {
  openapi: '3.1.0',
  info: {
    title: 'Penny Container API',
    version: '0.1.0',
  },
  components: {
    securitySchemes: {
      firebaseBearer: { type: 'http', scheme: 'bearer' },
      cronBearer: { type: 'http', scheme: 'bearer' },
    },
  },
  paths,
};

const rendered = `${JSON.stringify(document, null, 2)}\n`;

if (check) {
  const existing = readFileSync(outputPath, 'utf8');
  if (existing !== rendered) {
    throw new Error('docs/api/openapi.json is out of date. Run npm run api:contract without --check.');
  }
  console.log(`OpenAPI contract is up to date at ${outputPath}`);
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, rendered);
  console.log(`Wrote ${outputPath}`);
}
