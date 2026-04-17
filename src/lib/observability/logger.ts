import pino from 'pino';
import type { Logger } from 'pino';
import { getObservabilityEnv, isObservabilityEnabled } from './env';

const isDev = process.env.NODE_ENV !== 'production';

const baseLogger: Logger = pino({
  level: isObservabilityEnabled() ? 'info' : 'silent',
  base: {
    env: getObservabilityEnv(),
    service: 'penny-web',
  },
  redact: {
    paths: [
      '*.password',
      '*.token',
      '*.secret',
      'req.headers.authorization',
      'req.headers.cookie',
      'amount',
      'vendor',
    ],
    censor: '[redacted]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
});

export function createLogger(route: string): Logger {
  return baseLogger.child({ route });
}

export type { Logger };
