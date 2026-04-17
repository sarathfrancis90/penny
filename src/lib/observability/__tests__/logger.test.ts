import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger } from '../logger';

describe('observability/logger', () => {
  beforeEach(() => {
    process.env.OBSERVABILITY_ENABLED = 'true';
  });

  it('createLogger returns a logger with standard methods', () => {
    const logger = createLogger('test-route');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('child logger inherits bindings', () => {
    const base = createLogger('r');
    const child = base.child({ request_id: 'abc' });
    expect(child.bindings().request_id).toBe('abc');
  });

  it('logger works even when observability disabled', () => {
    process.env.OBSERVABILITY_ENABLED = 'false';
    const logger = createLogger('r');
    expect(() => logger.info('hello')).not.toThrow();
    expect(() => logger.error({ err: 'x' }, 'bad')).not.toThrow();
  });
});
