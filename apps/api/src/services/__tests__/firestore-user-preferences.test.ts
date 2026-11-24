import { describe, expect, it } from 'vitest';

import { FakeFirestore } from '../../test-support/fake-firestore';
import { createFirestoreUserPreferenceService } from '../firestore-user-preferences';

describe('default group preference', () => {
  it('reports no default group for a user with no profile document', async () => {
    const db = new FakeFirestore();
    const service = createFirestoreUserPreferenceService(db as never);

    await expect(service.getDefaultGroup({ userId: 'new-user' })).resolves.toEqual({
      defaultGroupId: null,
    });
  });

  it('returns the saved default group', async () => {
    const db = new FakeFirestore();
    db.seed('users/user-1', { preferences: { defaultGroupId: 'group-1' } });
    const service = createFirestoreUserPreferenceService(db as never);

    await expect(service.getDefaultGroup({ userId: 'user-1' })).resolves.toEqual({
      defaultGroupId: 'group-1',
    });
  });
});
