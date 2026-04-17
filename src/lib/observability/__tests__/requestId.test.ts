import { describe, it, expect } from 'vitest';
import { generateRequestId, extractRequestId, REQUEST_ID_HEADER } from '../requestId';

describe('observability/requestId', () => {
  it('generates UUIDv4-shaped ids', () => {
    const id = generateRequestId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('generates distinct ids each call', () => {
    expect(generateRequestId()).not.toBe(generateRequestId());
  });

  it('extracts id from header', () => {
    const h = new Headers({ [REQUEST_ID_HEADER]: 'abc' });
    expect(extractRequestId(h)).toBe('abc');
  });

  it('returns null if header missing', () => {
    expect(extractRequestId(new Headers())).toBeNull();
  });

  it('REQUEST_ID_HEADER is lowercase x-request-id', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });
});
