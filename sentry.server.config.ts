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
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });
}
