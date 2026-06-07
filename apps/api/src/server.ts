import { loadApiEnv } from './config/env';
import { buildApiApp } from './app';
import {
  createProductionAuthVerifier,
  createProductionReadyCheck,
  createProductionServices,
} from './services/production';

async function main() {
  const env = loadApiEnv();
  const app = await buildApiApp({
    auth: createProductionAuthVerifier(),
    readyCheck: createProductionReadyCheck(),
    services: createProductionServices(),
  });

  try {
    await app.listen({ host: '0.0.0.0', port: env.port });
  } catch (error) {
    app.log.error({ err: error }, 'api.start.failed');
    process.exit(1);
  }
}

void main();
