// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadString } from 'firebase/storage';

let testEnv: RulesTestEnvironment | undefined;

function personalExpense(userId: string) {
  return {
    vendor: 'Staples',
    amount: 42.5,
    date: '2026-06-01',
    category: 'Office expenses',
    userId,
    expenseType: 'personal',
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'penny-ci',
    firestore: {
      rules: readFileSync(resolve('database/firestore.rules'), 'utf8'),
    },
    storage: {
      rules: readFileSync(resolve('database/storage.rules'), 'utf8'),
    },
  });
});

afterEach(async () => {
  await testEnv?.clearFirestore();
  await testEnv?.clearStorage();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('Firestore security rules', () => {
  it('allows a signed-in user to create their own valid personal expense', async () => {
    if (!testEnv) {
      throw new Error('Firebase rules test environment was not initialized.');
    }
    const db = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(setDoc(doc(db, 'expenses/expense-1'), personalExpense('alice')));
  });

  it('blocks unauthenticated and cross-user personal expense writes', async () => {
    if (!testEnv) {
      throw new Error('Firebase rules test environment was not initialized.');
    }
    const unauthenticatedDb = testEnv.unauthenticatedContext().firestore();
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertFails(
      setDoc(doc(unauthenticatedDb, 'expenses/expense-1'), personalExpense('alice')),
    );
    await assertFails(setDoc(doc(aliceDb, 'expenses/expense-2'), personalExpense('bob')));
  });

  it('keeps group memberships and notifications server-only', async () => {
    if (!testEnv) {
      throw new Error('Firebase rules test environment was not initialized.');
    }
    const db = testEnv.authenticatedContext('alice', { email: 'alice@example.com' }).firestore();

    await assertFails(
      setDoc(doc(db, 'groupMembers/group-1_alice'), {
        groupId: 'group-1',
        userId: 'alice',
        role: 'owner',
        status: 'active',
        permissions: {
          canAddExpenses: true,
        },
      }),
    );

    await assertFails(
      setDoc(doc(db, 'notifications/notification-1'), {
        userId: 'alice',
        type: 'budget_alert',
        title: 'Budget alert',
        body: 'You are near a limit',
        read: false,
      }),
    );
  });
});

describe('Storage security rules', () => {
  it('allows owner image receipt uploads and rejects non-images or other users', async () => {
    if (!testEnv) {
      throw new Error('Firebase rules test environment was not initialized.');
    }
    const aliceStorage = testEnv.authenticatedContext('alice').storage();
    const bobStorage = testEnv.authenticatedContext('bob').storage();

    await assertSucceeds(
      uploadString(ref(aliceStorage, 'receipts/alice/receipt.png'), 'png-bytes', 'raw', {
        contentType: 'image/png',
      }),
    );

    await assertFails(
      uploadString(ref(aliceStorage, 'receipts/alice/receipt.txt'), 'text', 'raw', {
        contentType: 'text/plain',
      }),
    );

    await assertFails(
      uploadString(ref(bobStorage, 'receipts/alice/receipt.png'), 'png-bytes', 'raw', {
        contentType: 'image/png',
      }),
    );
  });

  it('rejects unknown storage paths', async () => {
    if (!testEnv) {
      throw new Error('Firebase rules test environment was not initialized.');
    }
    const storage = testEnv.authenticatedContext('alice').storage();

    await assertFails(
      uploadString(ref(storage, 'exports/alice/report.csv'), 'report', 'raw', {
        contentType: 'text/csv',
      }),
    );
  });
});
