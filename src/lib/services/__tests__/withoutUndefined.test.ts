import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('@/lib/firebase-admin', () => ({ adminDb: {} }));

const { withoutUndefined } = await import('../notificationGrouping');

describe('withoutUndefined', () => {
  it('drops undefined values at every level of plain objects', () => {
    const createdAt = Timestamp.now();
    const cleaned = withoutUndefined({
      a: 1,
      b: undefined,
      metadata: { groupName: undefined, category: 'Telephone', nested: { x: undefined, y: null } },
      list: [1, 2],
      createdAt,
    });
    expect(cleaned).toEqual({
      a: 1,
      metadata: { category: 'Telephone', nested: { y: null } },
      list: [1, 2],
      createdAt,
    });
    expect(cleaned.createdAt).toBe(createdAt);
  });
});
