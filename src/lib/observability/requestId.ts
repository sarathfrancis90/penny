import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export function generateRequestId(): string {
  return randomUUID();
}

export function extractRequestId(headers: Headers): string | null {
  return headers.get(REQUEST_ID_HEADER);
}
