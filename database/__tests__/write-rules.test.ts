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
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

/**
 * Write rules for groups, memberships, invitations, passkeys, savings
 * contributions, monthly setup status and expenses. The web and mobile apps
 * make these writes through the API (Admin SDK, rules bypassed), so the
 * client rules only need to allow the narrow self-service writes and must
 * stop privilege escalation.
 */

let testEnv: RulesTestEnvironment;

const OWNER = 'bob'; // owner of g1
const ADMIN = 'dave'; // admin of g1
const MEMBER = 'alice'; // member of g1
const VIEWER = 'vic'; // viewer of g1
const REMOVED = 'carol'; // former admin of g1
const ADMIN2 = 'erin'; // second admin of g1
const STRANGER = 'mallory'; // member of nothing

const PERMS = {
  owner: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: true,
    canDeleteExpenses: true,
    canApproveExpenses: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canViewReports: true,
    canExportData: true,
    canManageSettings: true,
  },
  admin: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: true,
    canDeleteExpenses: true,
    canApproveExpenses: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canViewReports: true,
    canExportData: true,
    canManageSettings: false,
  },
  member: {
    canAddExpenses: true,
    canEditOwnExpenses: true,
    canEditAllExpenses: false,
    canDeleteExpenses: false,
    canApproveExpenses: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canViewReports: true,
    canExportData: false,
    canManageSettings: false,
  },
  viewer: {
    canAddExpenses: false,
    canEditOwnExpenses: false,
    canEditAllExpenses: false,
    canDeleteExpenses: false,
    canApproveExpenses: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canViewReports: true,
    canExportData: false,
    canManageSettings: false,
  },
} as const;
type Role = keyof typeof PERMS;

function db(uid: string, email?: string) {
  return testEnv.authenticatedContext(uid, email ? { email } : undefined).firestore();
}

function membership(groupId: string, userId: string) {
  return `${groupId}_${userId}`;
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
    const member = (groupId: string, userId: string, role: Role, status = 'active') =>
      setDoc(doc(admin, 'groupMembers', membership(groupId, userId)), {
        groupId,
        userId,
        userEmail: `${userId}@example.com`,
        role,
        status,
        permissions: PERMS[role],
      });
    await member('g1', OWNER, 'owner');
    await member('g1', ADMIN, 'admin');
    await member('g1', ADMIN2, 'admin');
    await member('g1', MEMBER, 'member');
    await member('g1', VIEWER, 'viewer');
    await member('g1', REMOVED, 'admin', 'removed');
    await member('g2', OWNER, 'owner');

    const group = (id: string, createdBy: string) =>
      setDoc(doc(admin, 'groups', id), {
        name: `Group ${id}`,
        description: '',
        color: '#000000',
        icon: 'users',
        createdBy,
        createdAt: 1,
        updatedAt: 1,
        status: 'active',
        settings: { requireApproval: false, allowMemberInvites: false, defaultBudget: 0 },
        stats: { memberCount: 5, expenseCount: 0, totalAmount: 0 },
      });
    await group('g1', OWNER);
    await group('g2', OWNER);
    await group('g3', STRANGER);

    await setDoc(doc(admin, 'groupInvitations', 'inv1'), {
      groupId: 'g1',
      invitedEmail: 'newbie@example.com',
      invitedBy: OWNER,
      role: 'member',
      token: 'secret-token',
      status: 'pending',
      createdAt: 1,
    });

    await setDoc(doc(admin, 'passkeys', 'pk-alice'), {
      userId: MEMBER,
      credentialID: 'cred',
      credentialPublicKey: 'key',
      counter: 0,
      createdAt: 1,
    });

    await setDoc(doc(admin, 'savings_goals_personal', 'goal-alice'), { userId: MEMBER, name: 'Trip' });
    await setDoc(doc(admin, 'savings_goals_personal', 'goal-bob'), { userId: OWNER, name: 'Car' });
    await setDoc(doc(admin, 'savings_goals_group', 'goal-g1'), { groupId: 'g1', name: 'Team' });
    await setDoc(doc(admin, 'savings_contributions', 'contrib-alice'), {
      userId: MEMBER,
      goalId: 'goal-alice',
      amount: 10,
    });

    await setDoc(doc(admin, 'monthly_setup_status', `${MEMBER}_2026_06`), {
      userId: MEMBER,
      period: { month: 6, year: 2026 },
      setupCompleted: false,
      incomeConfirmed: false,
    });
    await setDoc(doc(admin, 'monthly_setup_status', 'g1_2026_06'), {
      groupId: 'g1',
      period: { month: 6, year: 2026 },
      setupCompleted: false,
      incomeConfirmed: false,
    });

    const expense = (id: string, data: Record<string, unknown>) =>
      setDoc(doc(admin, 'expenses', id), {
        vendor: 'Staples',
        amount: 10,
        date: '2026-06-01',
        category: 'Office expenses',
        ...data,
      });
    await expense('alice-personal', { userId: MEMBER, expenseType: 'personal', groupId: null });
    await expense('g1-alice', { userId: MEMBER, expenseType: 'group', groupId: 'g1' });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

// ---------------------------------------------------------------------------
// 1. Group settings
// ---------------------------------------------------------------------------
describe('groups update rule', () => {
  it('lets the owner change group settings and status', async () => {
    await assertSucceeds(
      updateDoc(doc(db(OWNER), 'groups', 'g1'), { 'settings.requireApproval': true, updatedAt: 2 }),
    );
    await assertSucceeds(updateDoc(doc(db(OWNER), 'groups', 'g1'), { status: 'archived' }));
  });

  it('lets an admin edit name, description, colour and icon', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN), 'groups', 'g1'), {
        name: 'Renamed',
        description: 'New description',
        color: '#ffffff',
        icon: 'briefcase',
        updatedAt: 2,
      }),
    );
  });

  it('stops an admin from changing settings', async () => {
    await assertFails(updateDoc(doc(db(ADMIN), 'groups', 'g1'), { 'settings.requireApproval': true }));
    await assertFails(
      updateDoc(doc(db(ADMIN), 'groups', 'g1'), {
        settings: { requireApproval: true, allowMemberInvites: true, defaultBudget: 0 },
      }),
    );
  });

  it('stops an admin from changing status, ownership or stats', async () => {
    await assertFails(updateDoc(doc(db(ADMIN), 'groups', 'g1'), { status: 'archived' }));
    await assertFails(updateDoc(doc(db(ADMIN), 'groups', 'g1'), { createdBy: ADMIN }));
    await assertFails(updateDoc(doc(db(ADMIN), 'groups', 'g1'), { 'stats.memberCount': 99 }));
  });

  it('stops the owner from handing the group to someone else', async () => {
    await assertFails(updateDoc(doc(db(OWNER), 'groups', 'g1'), { createdBy: ADMIN }));
  });

  it('stops members, viewers, former admins and strangers from updating', async () => {
    await assertFails(updateDoc(doc(db(MEMBER), 'groups', 'g1'), { name: 'Hijacked' }));
    await assertFails(updateDoc(doc(db(VIEWER), 'groups', 'g1'), { name: 'Hijacked' }));
    await assertFails(updateDoc(doc(db(REMOVED), 'groups', 'g1'), { name: 'Hijacked' }));
    await assertFails(updateDoc(doc(db(STRANGER), 'groups', 'g1'), { name: 'Hijacked' }));
  });

  it('keeps group creation and deletion server-side', async () => {
    await assertFails(
      setDoc(doc(db(STRANGER), 'groups', 'g-new'), {
        name: 'Client group',
        createdBy: STRANGER,
        createdAt: 1,
        status: 'active',
        settings: {},
        stats: { memberCount: 1 },
      }),
    );
    await assertFails(deleteDoc(doc(db(OWNER), 'groups', 'g1')));
  });

  it('still lets a member read their groups with the web __name__ in query', async () => {
    await assertSucceeds(getDoc(doc(db(MEMBER), 'groups', 'g1')));
    await assertSucceeds(
      getDocs(query(collection(db(OWNER), 'groups'), where('__name__', 'in', ['g1', 'g2']))),
    );
    await assertFails(getDoc(doc(db(MEMBER), 'groups', 'g2')));
  });
});

// ---------------------------------------------------------------------------
// 2. Group memberships
// ---------------------------------------------------------------------------
describe('groupMembers update rule', () => {
  const ref = (caller: string, target: string) => doc(db(caller), 'groupMembers', membership('g1', target));

  it('lets a member record their own activity and leave the group', async () => {
    await assertSucceeds(updateDoc(ref(MEMBER, MEMBER), { lastActivityAt: 5 }));
    await assertSucceeds(updateDoc(ref(MEMBER, MEMBER), { status: 'left', leftAt: 5 }));
  });

  it('stops the owner from leaving (ownership must be transferred first)', async () => {
    await assertFails(updateDoc(ref(OWNER, OWNER), { status: 'left', leftAt: 5 }));
  });

  it('stops a member from raising their own role or permissions', async () => {
    await assertFails(updateDoc(ref(MEMBER, MEMBER), { role: 'admin', permissions: PERMS.admin }));
    await assertFails(updateDoc(ref(MEMBER, MEMBER), { 'permissions.canManageSettings': true }));
    // Not even bundled with leaving.
    await assertFails(updateDoc(ref(MEMBER, MEMBER), { status: 'left', role: 'owner' }));
    await assertFails(
      updateDoc(ref(MEMBER, MEMBER), { status: 'left', 'permissions.canManageSettings': true }),
    );
  });

  it('stops a member from editing or removing other members', async () => {
    await assertFails(updateDoc(ref(MEMBER, VIEWER), { role: 'member', permissions: PERMS.member }));
    await assertFails(updateDoc(ref(MEMBER, VIEWER), { status: 'removed', removedBy: MEMBER }));
    await assertFails(updateDoc(ref(MEMBER, VIEWER), { lastActivityAt: 5 }));
  });

  it('lets an admin change a member or viewer role with that role\'s default permissions', async () => {
    await assertSucceeds(updateDoc(ref(ADMIN, MEMBER), { role: 'viewer', permissions: PERMS.viewer }));
    await assertSucceeds(
      updateDoc(ref(ADMIN, VIEWER), { role: 'member', permissions: PERMS.member, lastActivityAt: 5 }),
    );
  });

  it('stops an admin from granting custom permissions or the owner role', async () => {
    await assertFails(
      updateDoc(ref(ADMIN, MEMBER), {
        role: 'member',
        permissions: { ...PERMS.member, canManageSettings: true },
      }),
    );
    await assertFails(updateDoc(ref(ADMIN, MEMBER), { 'permissions.canManageSettings': true }));
    await assertFails(updateDoc(ref(ADMIN, MEMBER), { role: 'owner', permissions: PERMS.owner }));
  });

  it('stops an admin from editing or removing other admins, the owner, or themselves', async () => {
    await assertFails(updateDoc(ref(ADMIN, ADMIN2), { role: 'member', permissions: PERMS.member }));
    await assertFails(updateDoc(ref(ADMIN, ADMIN2), { status: 'removed', removedBy: ADMIN }));
    await assertFails(updateDoc(ref(ADMIN, OWNER), { status: 'removed', removedBy: ADMIN }));
    await assertFails(updateDoc(ref(ADMIN, ADMIN), { 'permissions.canManageSettings': true }));
  });

  it('lets an admin remove a member, and nothing else in the same write', async () => {
    await assertSucceeds(updateDoc(ref(ADMIN, MEMBER), { status: 'removed', removedBy: ADMIN, leftAt: 5 }));
  });

  it('stops a removal that also changes role or blames someone else', async () => {
    await assertFails(updateDoc(ref(ADMIN, VIEWER), { status: 'removed', role: 'admin' }));
    await assertFails(updateDoc(ref(ADMIN, VIEWER), { status: 'removed', removedBy: OWNER }));
  });

  it('lets the owner promote a member to admin and remove an admin', async () => {
    await assertSucceeds(updateDoc(ref(OWNER, MEMBER), { role: 'admin', permissions: PERMS.admin }));
    await assertSucceeds(updateDoc(ref(OWNER, ADMIN2), { status: 'removed', removedBy: OWNER }));
  });

  it('stops anyone from moving a membership to another user or group', async () => {
    await assertFails(updateDoc(ref(OWNER, MEMBER), { userId: STRANGER }));
    await assertFails(updateDoc(ref(OWNER, MEMBER), { groupId: 'g2' }));
    await assertFails(updateDoc(ref(MEMBER, MEMBER), { groupId: 'g2', lastActivityAt: 5 }));
  });

  it('stops a former admin from managing members', async () => {
    await assertFails(updateDoc(ref(REMOVED, MEMBER), { status: 'removed', removedBy: REMOVED }));
    await assertFails(updateDoc(ref(REMOVED, MEMBER), { role: 'viewer', permissions: PERMS.viewer }));
  });
});

// ---------------------------------------------------------------------------
// 3. Savings contributions
// ---------------------------------------------------------------------------
describe('savings_contributions rules', () => {
  const personal = (userId: string, goalId: string) => ({
    userId,
    goalId,
    goalName: 'Trip',
    amount: 25,
    date: 1,
    period: { month: 6, year: 2026 },
    contributionType: 'manual',
    currency: 'CAD',
  });

  it('lets a user record a contribution to their own goal', async () => {
    await assertSucceeds(addDoc(collection(db(MEMBER), 'savings_contributions'), personal(MEMBER, 'goal-alice')));
  });

  it('lets an active member record their own contribution to a group goal', async () => {
    await assertSucceeds(
      addDoc(collection(db(MEMBER), 'savings_contributions'), {
        ...personal(MEMBER, 'goal-g1'),
        groupId: 'g1',
      }),
    );
  });

  it('pins userId to the caller', async () => {
    await assertFails(addDoc(collection(db(MEMBER), 'savings_contributions'), personal(OWNER, 'goal-bob')));
    await assertFails(
      addDoc(collection(db(MEMBER), 'savings_contributions'), { ...personal(OWNER, 'goal-g1'), groupId: 'g1' }),
    );
    const { userId: _omit, ...noUser } = personal(MEMBER, 'goal-g1');
    void _omit;
    await assertFails(addDoc(collection(db(MEMBER), 'savings_contributions'), { ...noUser, groupId: 'g1' }));
  });

  it('stops contributions to someone else\'s goal or another group\'s goal', async () => {
    await assertFails(addDoc(collection(db(MEMBER), 'savings_contributions'), personal(MEMBER, 'goal-bob')));
    await assertFails(
      addDoc(collection(db(STRANGER), 'savings_contributions'), { ...personal(STRANGER, 'goal-g1'), groupId: 'g1' }),
    );
    await assertFails(
      addDoc(collection(db(OWNER), 'savings_contributions'), { ...personal(OWNER, 'goal-g1'), groupId: 'g2' }),
    );
  });

  it('keeps contributions immutable for clients', async () => {
    await assertFails(updateDoc(doc(db(MEMBER), 'savings_contributions', 'contrib-alice'), { userId: OWNER }));
    await assertFails(updateDoc(doc(db(MEMBER), 'savings_contributions', 'contrib-alice'), { amount: 1000 }));
  });

  it('lets a user list their own contributions, scoped by userId', async () => {
    await assertSucceeds(
      getDocs(query(collection(db(MEMBER), 'savings_contributions'), where('userId', '==', MEMBER))),
    );
    await assertFails(
      getDocs(query(collection(db(MEMBER), 'savings_contributions'), where('goalId', '==', 'goal-alice'))),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Passkeys
// ---------------------------------------------------------------------------
describe('passkeys rules', () => {
  it('stops clients creating passkeys (registration is server-side)', async () => {
    await assertFails(
      setDoc(doc(db(MEMBER), 'passkeys', 'pk-forged'), {
        userId: MEMBER,
        credentialID: 'attacker-cred',
        credentialPublicKey: 'attacker-key',
        counter: 0,
      }),
    );
  });

  it('stops clients editing passkeys, e.g. resetting the signature counter', async () => {
    await assertFails(updateDoc(doc(db(MEMBER), 'passkeys', 'pk-alice'), { counter: 0 }));
  });

  it('keeps passkey reads and deletes on the server API', async () => {
    await assertFails(getDoc(doc(db(MEMBER), 'passkeys', 'pk-alice')));
    await assertFails(getDocs(query(collection(db(MEMBER), 'passkeys'), where('userId', '==', MEMBER))));
    await assertFails(deleteDoc(doc(db(MEMBER), 'passkeys', 'pk-alice')));
    await assertFails(getDoc(doc(db(STRANGER), 'passkeys', 'pk-alice')));
  });
});

// ---------------------------------------------------------------------------
// 5. Monthly setup status
// ---------------------------------------------------------------------------
describe('monthly_setup_status rules', () => {
  const mine = (uid: string) => doc(db(uid), 'monthly_setup_status', `${MEMBER}_2026_06`);
  const group = (uid: string) => doc(db(uid), 'monthly_setup_status', 'g1_2026_06');

  it('lets the owner read and progress their own status', async () => {
    await assertSucceeds(getDoc(mine(MEMBER)));
    await assertSucceeds(
      getDocs(query(collection(db(MEMBER), 'monthly_setup_status'), where('userId', '==', MEMBER))),
    );
    await assertSucceeds(updateDoc(mine(MEMBER), { setupCompleted: true, incomeConfirmed: true }));
  });

  it('stops others reading or editing it', async () => {
    await assertFails(getDoc(mine(STRANGER)));
    await assertFails(updateDoc(mine(STRANGER), { setupCompleted: true }));
  });

  it('stops the owner reassigning it to another user, group or month', async () => {
    await assertFails(updateDoc(mine(MEMBER), { userId: OWNER }));
    await assertFails(updateDoc(mine(MEMBER), { groupId: 'g1' }));
    await assertFails(updateDoc(mine(MEMBER), { 'period.month': 7 }));
  });

  it('lets group members read, and admins progress, the group status', async () => {
    await assertSucceeds(getDoc(group(MEMBER)));
    await assertSucceeds(updateDoc(group(ADMIN), { setupCompleted: true }));
    await assertFails(updateDoc(group(MEMBER), { setupCompleted: true }));
    await assertFails(getDoc(group(STRANGER)));
  });

  it('stops a group admin moving the group status to another group', async () => {
    await assertFails(updateDoc(group(ADMIN), { groupId: 'g3' }));
    await assertFails(updateDoc(group(OWNER), { groupId: 'g2' }));
  });

  it('keeps creation and deletion server-side', async () => {
    await assertFails(
      setDoc(doc(db(MEMBER), 'monthly_setup_status', `${MEMBER}_2026_07`), {
        userId: MEMBER,
        period: { month: 7, year: 2026 },
      }),
    );
    await assertFails(deleteDoc(mine(MEMBER)));
  });
});

// ---------------------------------------------------------------------------
// 6. Other over-broad rules
// ---------------------------------------------------------------------------
describe('groupInvitations rules', () => {
  it('lets the invitee read and respond to their invitation (email case-insensitive)', async () => {
    const invitee = db('newbie', 'Newbie@Example.com');
    await assertSucceeds(getDoc(doc(invitee, 'groupInvitations', 'inv1')));
    await assertSucceeds(
      getDocs(
        query(
          collection(invitee, 'groupInvitations'),
          where('invitedEmail', '==', 'newbie@example.com'),
          where('status', '==', 'pending'),
        ),
      ),
    );
    await assertSucceeds(updateDoc(doc(invitee, 'groupInvitations', 'inv1'), { status: 'rejected', respondedAt: 5 }));
  });

  it('stops the invitee rewriting the invitation while responding', async () => {
    const invitee = db('newbie', 'newbie@example.com');
    await assertFails(
      updateDoc(doc(invitee, 'groupInvitations', 'inv1'), { status: 'accepted', role: 'owner' }),
    );
    await assertFails(
      updateDoc(doc(invitee, 'groupInvitations', 'inv1'), { status: 'accepted', groupId: 'g2' }),
    );
  });

  it('only lets group admins (not members or viewers) see invitation tokens', async () => {
    await assertSucceeds(getDoc(doc(db(ADMIN), 'groupInvitations', 'inv1')));
    await assertFails(getDoc(doc(db(MEMBER), 'groupInvitations', 'inv1')));
    await assertFails(getDoc(doc(db(VIEWER), 'groupInvitations', 'inv1')));
    await assertFails(getDocs(query(collection(db(MEMBER), 'groupInvitations'), where('groupId', '==', 'g1'))));
  });

  it('lets an admin cancel but not repurpose an invitation', async () => {
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'groupInvitations', 'inv1'), { status: 'cancelled' }));
    await assertFails(
      updateDoc(doc(db(ADMIN), 'groupInvitations', 'inv1'), { status: 'cancelled', invitedEmail: 'x@example.com' }),
    );
  });
});

describe('users profile rules', () => {
  it('lets a user save their profile with their own email', async () => {
    const alice = db(MEMBER, 'Alice@Example.com');
    await assertSucceeds(
      setDoc(doc(alice, 'users', MEMBER), { email: 'alice@example.com', displayName: 'Alice' }),
    );
    await assertSucceeds(updateDoc(doc(alice, 'users', MEMBER), { displayName: 'Alice B', defaultGroupId: 'g1' }));
  });

  it('stops a user claiming someone else\'s email (invitation lookups use it)', async () => {
    const alice = db(MEMBER, 'alice@example.com');
    await assertFails(setDoc(doc(alice, 'users', MEMBER), { email: 'newbie@example.com' }));
    await assertSucceeds(setDoc(doc(alice, 'users', MEMBER), { email: 'alice@example.com' }));
    await assertFails(updateDoc(doc(alice, 'users', MEMBER), { email: 'newbie@example.com' }));
    await assertFails(setDoc(doc(db(STRANGER), 'users', MEMBER), { displayName: 'x' }));
  });
});

describe('expenses update rules', () => {
  it('stops a personal expense being tagged with a group (budget pollution)', async () => {
    await assertFails(updateDoc(doc(db(MEMBER), 'expenses', 'alice-personal'), { groupId: 'g2' }));
    await assertSucceeds(updateDoc(doc(db(MEMBER), 'expenses', 'alice-personal'), { vendor: 'Costco' }));
  });

  it('lets an approver approve a group expense by touching only groupMetadata', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      // An approver without edit-all rights (custom permissions).
      await setDoc(doc(context.firestore(), 'groupMembers', membership('g1', 'approver')), {
        groupId: 'g1',
        userId: 'approver',
        role: 'member',
        status: 'active',
        permissions: { ...PERMS.member, canApproveExpenses: true },
      });
    });
    await assertSucceeds(
      updateDoc(doc(db('approver'), 'expenses', 'g1-alice'), {
        groupMetadata: { approvalStatus: 'approved', approvedBy: 'approver', approvedAt: 5 },
      }),
    );
    await assertFails(
      updateDoc(doc(db('approver'), 'expenses', 'g1-alice'), {
        groupMetadata: { approvalStatus: 'approved' },
        amount: 1,
      }),
    );
    await assertFails(
      updateDoc(doc(db(VIEWER), 'expenses', 'g1-alice'), { groupMetadata: { approvalStatus: 'approved' } }),
    );
  });
});
