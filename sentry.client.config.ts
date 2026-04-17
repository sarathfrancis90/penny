import * as Sentry from '@sentry/nextjs';
import {
  getSentryDsn,
  isObservabilityEnabled,
  getObservabilityEnv,
  getRelease,
} from './src/lib/observability/env';

const dsn = getSentryDsn();
if (isObservabilityEnabled() && dsn) {
  Sentry.init({
    dsn,
    environment: getObservabilityEnv(),
    release: getRelease(),
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    integrations: [
      Sentry.replayIntegration({
        maskAllInputs: true,
        maskAllText: false,
        blockAllMedia: true,
      }),
    ],
  });
}
