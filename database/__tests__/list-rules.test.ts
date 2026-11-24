// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

/**
 * Reads must be limited to the caller's own data or their active groups.
 * A signed-in stranger (mallory) must not be able to list anything, and the
 * queries the web app really runs must keep working.
 */

let testEnv: RulesTestEnvironment;

const ALICE = 'alice';
const BOB = 'bob';
const CAROL = 'carol'; // was an admin of g1, now removed
const MALLORY = 'mallory'; // signed in, member of nothing

const adminPermissions = {
  canAddExpenses: true,
  canEditOwnExpenses: true,
  canEditAllExpenses: true,
  canDeleteExpenses: true,
  canApproveExpenses: true,
};
const memberPermissions = {
  canAddExpenses: true,
  canEditOwnExpenses: true,
  canEditAllExpenses: false,
  canDeleteExpenses: false,
  canApproveExpenses: false,
};

function db(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'penny-ci',
    firestore: {
      rules: readFileSync(resolve('database/firestore.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    const member = (groupId: string, userId: string, role: string, status: string) =>
      setDoc(doc(admin, 'groupMembers', `${groupId}_${userId}`), {
        groupId,
        userId,
        role,
        status,
        permissions: role === 'member' ? memberPermissions : adminPermissions,
      });
    await member('g1', BOB, 'owner', 'active');
    await member('g1', ALICE, 'member', 'active');
    await member('g1', CAROL, 'admin', 'removed');
    await member('g2', BOB, 'owner', 'active');

    const expense = (id: string, data: Record<string, unknown>) =>
      setDoc(doc(admin, 'expenses', id), {
        vendor: 'Staples',
        amount: 10,
        date: '2026-06-01',
        category: 'Office expenses',
        ...data,
      });
    await expense('alice-personal', { userId: ALICE, expenseType: 'personal' });
    await expense('bob-personal', { userId: BOB, expenseType: 'personal' });
    await expense('g1-bob', { userId: BOB, expenseType: 'group', groupId: 'g1' });
    await expense('g2-bob', { userId: BOB, expenseType: 'group', groupId: 'g2' });

    await setDoc(doc(admin, 'conversations', 'c-alice'), { userId: ALICE, status: 'active', updatedAt: 1 });
    await setDoc(doc(admin, 'conversations', 'c-alice', 'messages', 'm1'), { role: 'user', content: 'hi', timestamp: 1 });
    await setDoc(doc(admin, 'conversations', 'c-bob'), { userId: BOB, status: 'active', updatedAt: 1 });
    await setDoc(doc(admin, 'conversations', 'c-bob', 'messages', 'm1'), { role: 'user', content: 'secret', timestamp: 1 });

    for (const name of [
      'budgets_personal',
      'notifications',
      'pushSubscriptions',
      'income_sources_personal',
      'savings_goals_personal',
    ]) {
      await setDoc(doc(admin, name, 'alice-doc'), { userId: ALICE, read: false, createdAt: 1 });
      await setDoc(doc(admin, name, 'bob-doc'), { userId: BOB, read: false, createdAt: 1 });
    }
    for (const name of ['budgets_group', 'income_sources_group', 'savings_goals_group']) {
      await setDoc(doc(admin, name, 'g1-doc'), { groupId: 'g1', createdAt: 1 });
      await setDoc(doc(admin, name, 'g2-doc'), { groupId: 'g2', createdAt: 1 });
    }
    await setDoc(doc(admin, 'challenges', 'bob'), { challenge: 'abc', type: 'registration' });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('expenses list rule', () => {
  it('lets a user list their own expenses', async () => {
    await assertSucceeds(getDocs(query(collection(db(ALICE), 'expenses'), where('userId', '==', ALICE))));
  });

  it('lets an active member list a group\'s expenses (web per-group query)', async () => {
    await assertSucceeds(
      getDocs(
        query(collection(db(ALICE), 'expenses'), where('groupId', '==', 'g1'), where('expenseType', '==', 'group')),
      ),
    );
  });

  it('blocks listing everything, another user, or every group expense', async () => {
    await assertFails(getDocs(collection(db(MALLORY), 'expenses')));
    await assertFails(getDocs(query(collection(db(MALLORY), 'expenses'), where('userId', '==', BOB))));
    await assertFails(getDocs(query(collection(db(ALICE), 'expenses'), where('expenseType', '==', 'group'))));
  });

  it('blocks listing a group the caller is not an active member of', async () => {
    await assertFails(getDocs(query(collection(db(ALICE), 'expenses'), where('groupId', '==', 'g2'))));
    await assertFails(getDocs(query(collection(db(CAROL), 'expenses'), where('groupId', '==', 'g1'))));
  });
});

describe('expenses write rules for former members', () => {
  it('stops a removed admin from editing or deleting group expenses', async () => {
    await assertFails(updateDoc(doc(db(CAROL), 'expenses', 'g1-bob'), { vendor: 'Edited' }));
    await assertFails(deleteDoc(doc(db(CAROL), 'expenses', 'g1-bob')));
  });

  it('still lets an active member edit and delete their own group expense', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'expenses', 'g1-alice'), {
        vendor: 'Staples',
        amount: 10,
        date: '2026-06-01',
        category: 'Office expenses',
        userId: ALICE,
        expenseType: 'group',
        groupId: 'g1',
      });
    });
    await assertSucceeds(updateDoc(doc(db(ALICE), 'expenses', 'g1-alice'), { vendor: 'Edited' }));
    await assertSucceeds(deleteDoc(doc(db(ALICE), 'expenses', 'g1-alice')));
  });

  it('stops a member from reassigning their group expense to someone else', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'expenses', 'g1-alice'), {
        vendor: 'Staples',
        amount: 10,
        date: '2026-06-01',
        category: 'Office expenses',
        userId: ALICE,
        expenseType: 'group',
        groupId: 'g1',
      });
    });
    await assertFails(updateDoc(doc(db(ALICE), 'expenses', 'g1-alice'), { userId: BOB }));
  });
});

describe('group membership list rule', () => {
  it('lets a user list their own memberships and their group\'s members', async () => {
    await assertSucceeds(
      getDocs(query(collection(db(ALICE), 'groupMembers'), where('userId', '==', ALICE), where('status', '==', 'active'))),
    );
    await assertSucceeds(
      getDocs(query(collection(db(ALICE), 'groupMembers'), where('groupId', '==', 'g1'), where('status', '==', 'active'))),
    );
  });

  it('blocks listing all memberships or another group\'s members', async () => {
    await assertFails(getDocs(collection(db(MALLORY), 'groupMembers')));
    await assertFails(getDocs(query(collection(db(ALICE), 'groupMembers'), where('groupId', '==', 'g2'))));
    await assertFails(getDocs(query(collection(db(MALLORY), 'groupMembers'), where('userId', '==', BOB))));
  });
});

describe('conversation list rules', () => {
  it('lets a user list their own conversations and messages', async () => {
    await assertSucceeds(
      getDocs(query(collection(db(ALICE), 'conversations'), where('userId', '==', ALICE), orderBy('updatedAt', 'desc'))),
    );
    await assertSucceeds(
      getDocs(query(collection(db(ALICE), 'conversations', 'c-alice', 'messages'), orderBy('timestamp', 'asc'))),
    );
  });

  it('blocks reading other people\'s conversations and messages', async () => {
    await assertFails(getDocs(collection(db(MALLORY), 'conversations')));
    await assertFails(getDocs(query(collection(db(MALLORY), 'conversations'), where('userId', '==', BOB))));
    await assertFails(getDocs(collection(db(MALLORY), 'conversations', 'c-bob', 'messages')));
  });
});

describe('personal collections list rules', () => {
  const personal = [
    'budgets_personal',
    'notifications',
    'pushSubscriptions',
    'income_sources_personal',
    'savings_goals_personal',
  ];

  it.each(personal)('%s: own documents only', async (name) => {
    await assertSucceeds(getDocs(query(collection(db(ALICE), name), where('userId', '==', ALICE))));
    await assertFails(getDocs(collection(db(MALLORY), name)));
    await assertFails(getDocs(query(collection(db(MALLORY), name), where('userId', '==', BOB))));
  });

  it('notifications: the web unread query still works', async () => {
    await assertSucceeds(
      getDocs(
        query(collection(db(ALICE), 'notifications'), where('userId', '==', ALICE), where('read', '==', false)),
      ),
    );
  });
});

describe('group collections list rules', () => {
  const grouped = ['budgets_group', 'income_sources_group', 'savings_goals_group'];

  it.each(grouped)('%s: active members only', async (name) => {
    await assertSucceeds(getDocs(query(collection(db(ALICE), name), where('groupId', '==', 'g1'))));
    await assertFails(getDocs(collection(db(MALLORY), name)));
    await assertFails(getDocs(query(collection(db(ALICE), name), where('groupId', '==', 'g2'))));
    await assertFails(getDocs(query(collection(db(CAROL), name), where('groupId', '==', 'g1'))));
  });
});

describe('passkey challenges', () => {
  it('are server-only', async () => {
    await assertFails(getDoc(doc(db(MALLORY), 'challenges', 'bob')));
    await assertFails(setDoc(doc(db(MALLORY), 'challenges', 'bob'), { challenge: 'forged' }));
    await assertFails(deleteDoc(doc(db(MALLORY), 'challenges', 'bob')));
  });
});

describe('remaining web client queries', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore();
      for (const name of ['monthly_income_records', 'monthly_savings_summary']) {
        await setDoc(doc(admin, name, 'alice-2026-06'), { userId: ALICE, period: { month: 6, year: 2026 } });
        await setDoc(doc(admin, name, 'bob-2026-06'), { userId: BOB, period: { month: 6, year: 2026 } });
      }
      await setDoc(doc(admin, 'savings_contributions', 'c-alice'), {
        userId: ALICE,
        goalId: 'goal-a',
        date: 1,
        period: { month: 6, year: 2026 },
      });
      await setDoc(doc(admin, 'savings_contributions', 'c-g1'), {
        userId: BOB,
        groupId: 'g1',
        goalId: 'goal-g1',
        date: 1,
        period: { month: 6, year: 2026 },
      });
    });
  });

  it('useIncomeAnalytics / useSavingsAnalytics yearly queries', async () => {
    for (const name of ['monthly_income_records', 'monthly_savings_summary']) {
      await assertSucceeds(
        getDocs(
          query(
            collection(db(ALICE), name),
            where('userId', '==', ALICE),
            where('period.year', '==', 2026),
            orderBy('period.month', 'asc'),
          ),
        ),
      );
      await assertFails(getDocs(query(collection(db(MALLORY), name), where('userId', '==', ALICE))));
    }
  });

  it('SavingsContributionService queries scoped by userId or groupId', async () => {
    const c = (uid: string) => collection(db(uid), 'savings_contributions');
    await assertSucceeds(
      getDocs(query(c(ALICE), where('userId', '==', ALICE), where('goalId', '==', 'goal-a'), orderBy('date', 'desc'))),
    );
    await assertSucceeds(
      getDocs(query(c(ALICE), where('groupId', '==', 'g1'), where('goalId', '==', 'goal-g1'), orderBy('date', 'desc'))),
    );
    await assertSucceeds(
      getDocs(
        query(
          c(ALICE),
          where('userId', '==', ALICE),
          where('period.month', '==', 6),
          where('period.year', '==', 2026),
          orderBy('date', 'desc'),
        ),
      ),
    );
    // The old unscoped goal query is denied, as are other people's.
    await assertFails(getDocs(query(c(ALICE), where('goalId', '==', 'goal-a'), orderBy('date', 'desc'))));
    await assertFails(getDocs(query(c(MALLORY), where('groupId', '==', 'g1'))));
    await assertFails(getDocs(query(c(CAROL), where('groupId', '==', 'g1'))));
  });

  it('group income and savings pages filter by groupId', async () => {
    await assertSucceeds(
      getDocs(
        query(collection(db(ALICE), 'income_sources_group'), where('groupId', '==', 'g1'), where('isActive', '==', true)),
      ),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db(ALICE), 'savings_goals_group'),
          where('groupId', '==', 'g1'),
          where('isActive', '==', true),
          where('status', '==', 'active'),
        ),
      ),
    );
  });
});
