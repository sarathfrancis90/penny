// End-to-end API run against the local API + Firebase emulators.
// Usage: node api-e2e.mjs [receiptsDir]
import fs from 'node:fs';

const API = process.env.API ?? 'http://127.0.0.1:8787';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const receiptsDir = process.argv[2];
const run = Date.now().toString(36);
let pass = 0;
const failures = [];
const notes = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}
const short = (v) => JSON.stringify(v)?.slice(0, 260);

async function signUp(name) {
  const email = `${name}-${run}@example.test`;
  const r = await fetch(`${AUTH}/accounts:signUp?key=local`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: `pw-${run}-${name}`, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(`signUp failed ${short(j)}`);
  return { name, email, uid: j.localId, token: j.idToken };
}

async function call(user, method, path, body, extra = {}) {
  const headers = { ...(extra.headers ?? {}) };
  if (user) headers.authorization = `Bearer ${user.token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const t0 = Date.now();
  const r = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: r.status, json, ms: Date.now() - t0 };
}
const today = new Date();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const expenseBody = (over = {}) => ({ vendor: 'Staples', amount: 42.5, date: ymd(today), category: 'Office expenses', description: 'Paper', ...over });
const idOf = (j) => j?.expense?.id ?? j?.id ?? j?.expenseId ?? j?.data?.id;
const listOf = (j) => j?.expenses ?? j?.data ?? j?.items ?? [];

console.log('== health and auth gate');
check('healthz', (await call(null, 'GET', '/api/healthz')).status === 200);
check('readyz', (await call(null, 'GET', '/api/readyz')).status === 200);
check('no token is refused', (await call(null, 'GET', '/api/expenses')).status === 401);
check('bad token is refused', (await call({ token: 'nope' }, 'GET', '/api/expenses')).status === 401);

const [alice, bob, vera, mallory, temp] = await Promise.all(['alice', 'bob', 'vera', 'mallory', 'temp'].map(signUp));

console.log('== personal expenses');
let r = await call(alice, 'POST', '/api/expenses', expenseBody());
check('create personal expense', r.status < 300 && idOf(r.json), `${r.status} ${short(r.json)}`);
const personalId = idOf(r.json);
r = await call(alice, 'GET', '/api/expenses?scope=all');
check('list shows it', r.status === 200 && listOf(r.json).some((e) => e.id === personalId), `${r.status} ${short(r.json)}`);
const listed = listOf(r.json).find((e) => e.id === personalId);
notes.push(`listed expense date field: ${short(listed?.date)}`);
r = await call(alice, 'GET', `/api/expenses/${personalId}`);
check('owner can read it', r.status === 200, `${r.status}`);
check('stranger cannot read it', [403, 404].includes((await call(mallory, 'GET', `/api/expenses/${personalId}`)).status));
check('stranger cannot edit it', [403, 404].includes((await call(mallory, 'PATCH', `/api/expenses/${personalId}`, { amount: 1 })).status));
check('stranger cannot delete it', [403, 404].includes((await call(mallory, 'DELETE', `/api/expenses/${personalId}`)).status));
for (const [label, body] of [
  ['impossible date 2025-02-31', expenseBody({ date: '2025-02-31' })],
  ['month 13', expenseBody({ date: '2025-13-01' })],
  ['zero amount', expenseBody({ amount: 0 })],
  ['negative amount', expenseBody({ amount: -5 })],
  ['unknown category', expenseBody({ category: 'Not a CRA category' })],
  ['missing vendor', expenseBody({ vendor: '' })],
]) {
  r = await call(alice, 'POST', '/api/expenses', body);
  check(`rejects ${label}`, r.status === 400, `${r.status} ${short(r.json)}`);
}
r = await call(alice, 'POST', '/api/expenses', expenseBody({ date: '2025-03-02', vendor: 'Old Receipt', amount: 63 }));
check('accepts a 2025 date', r.status < 300, `${r.status} ${short(r.json)}`);
const oldId = idOf(r.json);
r = await call(alice, 'GET', '/api/expenses?scope=all');
const old = listOf(r.json).find((e) => e.id === oldId);
const oldDate = old?.date?._seconds ? new Date(old.date._seconds * 1000) : new Date(old?.date?.seconds ? old.date.seconds * 1000 : old?.date);
check('2025-03-02 stays March 2 in Canadian time zones', ['America/St_Johns', 'America/Toronto', 'America/Vancouver'].every((tz) => oldDate.toLocaleDateString('en-CA', { timeZone: tz }) === '2025-03-02'), short(old?.date));

console.log('== retry safety');
const clientRequestId = `e2e${run}abcdefghijklmnop`.slice(0, 32);
const first = await call(alice, 'POST', '/api/expenses', expenseBody({ vendor: 'Retry Cafe', amount: 9.99, clientRequestId }));
const second = await call(alice, 'POST', '/api/expenses', expenseBody({ vendor: 'Retry Cafe', amount: 9.99, clientRequestId }));
check('retried save returns the same expense', first.status < 300 && second.status < 300 && idOf(first.json) === idOf(second.json), `${first.status}/${second.status} ${idOf(first.json)} ${idOf(second.json)}`);
r = await call(alice, 'GET', '/api/expenses?scope=all');
check('retried save created only one', listOf(r.json).filter((e) => e.vendor === 'Retry Cafe').length === 1);
r = await call(alice, 'POST', '/api/expenses/duplicate-check', { vendor: 'Retry Cafe', amount: 9.99, date: ymd(today) });
check('duplicate check finds it', r.status === 200 && /true|duplicate/i.test(JSON.stringify(r.json)), `${r.status} ${short(r.json)}`);

console.log('== edit and delete');
r = await call(alice, 'PATCH', `/api/expenses/${personalId}`, { amount: 50, vendor: 'Staples Canada' });
check('owner edits', r.status === 200, `${r.status} ${short(r.json)}`);
r = await call(alice, 'GET', `/api/expenses/${personalId}`);
check('edit is saved', JSON.stringify(r.json).includes('Staples Canada') && JSON.stringify(r.json).includes('50'), short(r.json));
r = await call(alice, 'PATCH', `/api/expenses/${personalId}`, { amount: -3 });
check('edit with a bad amount is rejected', r.status === 400, `${r.status} ${short(r.json)}`);
r = await call(alice, 'PUT', `/api/expenses/${personalId}`, { amount: 51, vendor: 'Staples Canada', date: ymd(today), category: 'Office expenses' });
check('PUT edit works', r.status === 200, `${r.status} ${short(r.json)}`);
check('owner deletes', (await call(alice, 'DELETE', `/api/expenses/${personalId}`)).status === 200);
check('deleted is gone', (await call(alice, 'GET', `/api/expenses/${personalId}`)).status === 404);

console.log('== groups, roles and invitations');
r = await call(bob, 'POST', '/api/groups', { name: `Household ${run}`, userName: 'Bob' });
check('create group', r.status === 200 && r.json.groupId, `${r.status} ${short(r.json)}`);
const g1 = r.json.groupId;
async function inviteAndAccept(owner, group, user, role) {
  const inv = await call(owner, 'POST', `/api/groups/${group}/members`, { email: user.email, role });
  const token = inv.json?.invitation?.token ?? inv.json?.token ?? inv.json?.invitationToken;
  if (inv.status !== 200 || !token) return { inv, acc: null };
  const acc = await call(user, 'POST', '/api/groups/invitations/accept', { token, userName: user.name });
  return { inv, acc, token };
}
let ia = await inviteAndAccept(bob, g1, alice, 'member');
check('invite + accept member', ia.acc?.status === 200, `${ia.inv.status} ${short(ia.inv.json)} ${short(ia.acc?.json)}`);
const aliceToken = ia.token;
ia = await inviteAndAccept(bob, g1, vera, 'viewer');
check('invite + accept viewer', ia.acc?.status === 200, `${ia.inv.status} ${short(ia.acc?.json)}`);
r = await call(bob, 'POST', `/api/groups/${g1}/members`, { email: temp.email, role: 'member' });
const tempToken = r.json?.invitation?.token ?? r.json?.token ?? r.json?.invitationToken;
r = await call(mallory, 'POST', '/api/groups/invitations/accept', { token: tempToken, userEmail: temp.email, userName: 'Mallory' });
check('someone else cannot accept an invitation by claiming the email', r.status >= 400, `${r.status} ${short(r.json)}`);
r = await call(alice, 'POST', '/api/groups/invitations/accept', { token: aliceToken, userName: 'Alice' });
notes.push(`second accept of a used invitation -> ${r.status}`);
r = await call(bob, 'GET', `/api/groups/${g1}`);
const memberCount = r.json?.group?.stats?.memberCount ?? r.json?.stats?.memberCount;
check('member count is 3 after accepts', memberCount === 3, `count=${memberCount} ${short(r.json)}`);
check('stranger cannot read group', [403, 404].includes((await call(mallory, 'GET', `/api/groups/${g1}`)).status));
check('stranger cannot list members', [403, 404].includes((await call(mallory, 'GET', `/api/groups/${g1}/members`)).status));
check('member cannot invite', (await call(alice, 'POST', `/api/groups/${g1}/members`, { email: 'x@example.test', role: 'member' })).status === 403);
check('viewer cannot change settings', (await call(vera, 'PATCH', `/api/groups/${g1}`, { name: 'Hacked' })).status === 403);

console.log('== group expenses and permissions');
r = await call(alice, 'POST', '/api/expenses', expenseBody({ groupId: g1, expenseType: 'group', vendor: 'Sobeys', amount: 80, category: 'Groceries' }));
check('member adds group expense', r.status < 300 && idOf(r.json), `${r.status} ${short(r.json)}`);
const ge = idOf(r.json);
r = await call(vera, 'POST', '/api/expenses', expenseBody({ groupId: g1, expenseType: 'group', vendor: 'Viewer', amount: 5 }));
check('viewer cannot add group expense', r.status === 403, `${r.status} ${short(r.json)}`);
r = await call(mallory, 'POST', '/api/expenses', expenseBody({ groupId: g1, expenseType: 'group', vendor: 'Stranger', amount: 5 }));
check('stranger cannot add group expense', r.status === 403, `${r.status}`);
check('stranger cannot edit group expense', [403, 404].includes((await call(mallory, 'PATCH', `/api/expenses/${ge}`, { amount: 1 })).status));
check('stranger cannot delete group expense', [403, 404].includes((await call(mallory, 'DELETE', `/api/expenses/${ge}`)).status));
check('viewer cannot edit group expense', (await call(vera, 'PATCH', `/api/expenses/${ge}`, { amount: 1 })).status === 403);
check('viewer cannot delete group expense', (await call(vera, 'DELETE', `/api/expenses/${ge}`)).status === 403);
r = await call(bob, 'POST', '/api/expenses', expenseBody({ groupId: g1, expenseType: 'group', vendor: 'Owner Buy', amount: 20 }));
const ownerExpense = idOf(r.json);
check('member cannot edit another member\'s expense', (await call(alice, 'PATCH', `/api/expenses/${ownerExpense}`, { amount: 1 })).status === 403);
const groupTotal = async () => { const g = await call(bob, 'GET', `/api/groups/${g1}`); return g.json?.group?.stats?.totalAmount ?? g.json?.stats?.totalAmount; };
check('group total is 100 after two expenses', (await groupTotal()) === 100, `total=${await groupTotal()}`);
r = await call(alice, 'PATCH', `/api/expenses/${ge}`, { amount: 90 });
check('member edits own group expense', r.status === 200, `${r.status} ${short(r.json)}`);
check('group total follows the edit (110)', (await groupTotal()) === 110, `total=${await groupTotal()}`);
r = await call(alice, 'GET', `/api/expenses?groupId=${g1}`);
check('member lists group expenses', r.status === 200 && listOf(r.json).length === 2, `${r.status} n=${listOf(r.json).length}`);
check('stranger cannot list group expenses', [403, 404].includes((await call(mallory, 'GET', `/api/expenses?groupId=${g1}`)).status));
r = await call(alice, 'GET', '/api/expenses?scope=all&approvalStatus=approved');
check('approvalStatus without a group does not error', r.status === 200, `${r.status} ${short(r.json)}`);
r = await call(alice, 'GET', '/api/expenses?scope=personal&category=Groceries');
check('personal + category filter works', r.status === 200, `${r.status}`);
r = await call(bob, 'GET', `/api/groups/${g1}/activities`);
check('group activity feed loads', r.status === 200, `${r.status} ${short(r.json)}`);
r = await call(bob, 'GET', '/api/notifications');
check('owner got notifications for group activity', r.status === 200 && (r.json.notifications ?? r.json.data ?? []).length > 0, `${r.status} ${short(r.json)}`);
check('mark all read', (await call(bob, 'POST', '/api/notifications/mark-all-read', {})).status === 200);
check('owner deletes a member\'s expense', (await call(bob, 'DELETE', `/api/expenses/${ge}`)).status === 200);
check('group total follows the delete (20)', (await groupTotal()) === 20, `total=${await groupTotal()}`);

console.log('== cross-group protections');
r = await call(mallory, 'POST', '/api/groups', { name: `Other ${run}`, userName: 'Mallory' });
const g2 = r.json.groupId;
r = await call(mallory, 'PATCH', `/api/groups/${g2}/members/${g1}_${alice.uid}`, { role: 'viewer', newRole: 'viewer' });
check('admin of another group cannot change this group\'s member', r.status >= 400, `${r.status} ${short(r.json)}`);
r = await call(mallory, 'DELETE', `/api/groups/${g2}/members/${g1}_${alice.uid}`);
check('admin of another group cannot remove this group\'s member', r.status >= 400, `${r.status} ${short(r.json)}`);
r = await call(alice, 'GET', `/api/groups/${g1}/membership/me`);
check('member is untouched', r.status === 200 && /"role":"member"/.test(JSON.stringify(r.json)) && /"status":"active"/.test(JSON.stringify(r.json)), short(r.json));
r = await call(bob, 'POST', '/api/savings/group', { groupId: g1, name: 'Trip', targetAmount: 1000, currentAmount: 0, category: 'travel', monthlyContribution: 50, priority: 1, status: 'active', isActive: true });
const goalId = r.json?.id ?? r.json?.goal?.id ?? r.json?.item?.id ?? r.json?.data?.id;
check('owner creates group savings goal', r.status < 300 && goalId, `${r.status} ${short(r.json)}`);
if (goalId) {
  r = await call(bob, 'PATCH', `/api/savings/group/${goalId}`, { groupId: g2, name: 'Trip moved' });
  const after = await call(bob, 'GET', `/api/savings/group/${goalId}`);
  check('a goal cannot be moved to another group', JSON.stringify(after.json).includes(g1) && !JSON.stringify(after.json).includes(g2), `${r.status} ${short(after.json)}`);
  r = await call(vera, 'POST', `/api/savings/group/${goalId}/contributions`, { amount: 10 });
  check('viewer cannot contribute to a group goal', r.status === 403, `${r.status} ${short(r.json)}`);
  r = await call(alice, 'POST', `/api/savings/group/${goalId}/contributions`, { amount: 25 });
  check('member can contribute to a group goal', r.status < 300, `${r.status} ${short(r.json)}`);
}

console.log('== leaving and removal');
check('member leaves', (await call(alice, 'POST', `/api/groups/${g1}/leave`, {})).status === 200);
r = await call(alice, 'POST', `/api/groups/${g1}/leave`, {});
notes.push(`second leave -> ${r.status}`);
r = await call(bob, 'GET', `/api/groups/${g1}`);
check('member count is 2 after one leave (even if repeated)', (r.json?.group?.stats?.memberCount ?? r.json?.stats?.memberCount) === 2, short(r.json?.group?.stats ?? r.json?.stats));
check('former member cannot add group expense', (await call(alice, 'POST', '/api/expenses', expenseBody({ groupId: g1, expenseType: 'group' }))).status === 403);
check('former member cannot edit group expense', [403, 404].includes((await call(alice, 'PATCH', `/api/expenses/${ownerExpense}`, { amount: 1 })).status));

console.log('== invitation arrives in the app and can be accepted there');
const nina = await signUp('nina');
r = await call(bob, 'POST', `/api/groups/${g1}/members`, { email: nina.email, role: 'member' });
check('invite a user who has never opened the app', r.status === 200, `${r.status} ${short(r.json)}`);
r = await call(nina, 'GET', '/api/notifications');
const inviteNote = (r.json.notifications ?? r.json.data ?? []).find((n) => n.type === 'group_invitation');
check('invited user gets the invitation notification', Boolean(inviteNote), `${r.status} ${short(r.json)}`);
check('notification carries the token the installed app needs', Boolean(inviteNote?.metadata?.invitationToken), short(inviteNote?.metadata));
r = await call(nina, 'GET', '/api/groups/invitations');
const ninaInvite = (r.json?.invitations ?? []).find((i) => i.groupId === g1);
check('invited user sees the invitation in their pending list', r.status === 200 && Boolean(ninaInvite), `${r.status} ${short(r.json)}`);
check('pending list names the group and never includes the token', Boolean(ninaInvite?.groupName) && !JSON.stringify(r.json).includes(inviteNote?.metadata?.invitationToken ?? '@@none'), short(ninaInvite));
r = await call(mallory, 'GET', '/api/groups/invitations');
check('someone else does not see that invitation', r.status === 200 && !(r.json?.invitations ?? []).some((i) => i.groupId === g1), `${r.status} ${short(r.json)}`);
r = await call(mallory, 'POST', '/api/groups/invitations/accept', { invitationId: inviteNote?.metadata?.invitationId });
check('a stranger cannot accept by invitation id', r.status >= 400, `${r.status}`);
r = await call(nina, 'POST', '/api/groups/invitations/accept', { invitationId: inviteNote?.metadata?.invitationId, userName: 'Nina' });
check('invited user can accept with only the invitation id', r.status === 200, `${r.status} ${short(r.json)}`);
r = await call(nina, 'GET', '/api/groups');
check('accepted group shows in their groups', r.status === 200 && JSON.stringify(r.json).includes(g1), short(r.json));
r = await call(nina, 'GET', '/api/groups/invitations');
check('accepted invitation leaves the pending list', r.status === 200 && !(r.json?.invitations ?? []).some((i) => i.groupId === g1), `${r.status} ${short(r.json)}`);

console.log('== default group, profile, preferences');
r = await call(temp, 'GET', '/api/user/default-group');
check('default group is empty (not an error) for a brand-new user', r.status === 200, `${r.status} ${short(r.json)}`);
r = await call(bob, 'POST', '/api/user/default-group', { groupId: g1 });
check('set default group', r.status === 200, `${r.status} ${short(r.json)}`);
r = await call(bob, 'GET', '/api/user/default-group');
check('default group is returned under both names', r.json.groupId === g1 && r.json.defaultGroupId === g1, short(r.json));
r = await call(bob, 'PATCH', '/api/user/profile', { displayName: 'Bob E2E', email: 'evil@example.test', fcmTokens: { x: 1 } });
check('profile update works', r.status === 200, `${r.status} ${short(r.json)}`);
r = await call(bob, 'GET', '/api/user/profile');
check('profile update cannot overwrite email or push tokens', !JSON.stringify(r.json).includes('evil@example.test') && !/"fcmTokens":\{"x":1\}/.test(JSON.stringify(r.json)), short(r.json));
check('preferences round trip', (await call(bob, 'PATCH', '/api/user/preferences', { currency: 'CAD' })).status === 200 && (await call(bob, 'GET', '/api/user/preferences')).status === 200);
r = await call(bob, 'PUT', '/api/notification-settings', { quietHoursStart: '22:00', quietHoursEnd: '07:00', timezone: 'America/Vancouver', isAdmin: true });
check('notification settings save with a time zone', r.status < 300, `${r.status} ${short(r.json)}`);
r = await call(bob, 'GET', '/api/notification-settings');
check('unknown notification-settings keys are not stored', r.status === 200 && !JSON.stringify(r.json).includes('isAdmin') && JSON.stringify(r.json).includes('America/Vancouver'), short(r.json));
r = await call(bob, 'PUT', '/api/notification-settings', { quietHoursStart: '25:00' });
check('an impossible quiet-hours time is rejected', r.status === 400, `${r.status} ${short(r.json)}`);
check('push token delete for unknown device is not an error', (await call(temp, 'DELETE', '/api/push-tokens/unknown-device')).status < 300);

console.log('== budgets, income, savings');
r = await call(bob, 'POST', '/api/budgets/personal', { category: 'Office expenses', monthlyLimit: 200, period: { month: today.getMonth() + 1, year: today.getFullYear() } });
check('create personal budget', r.status < 300, `${r.status} ${short(r.json)}`);
check('list personal budgets', (await call(bob, 'GET', `/api/budgets/personal?month=${today.getMonth() + 1}&year=${today.getFullYear()}`)).status === 200);
r = await call(bob, 'GET', '/api/budgets/usage/personal');
check('budget usage without month/year', r.status === 200, `${r.status} ${short(r.json)}`);
r = await call(bob, 'POST', '/api/budgets/group', { groupId: g1, category: 'Groceries', monthlyLimit: 500, period: { month: today.getMonth() + 1, year: today.getFullYear() } });
check('owner creates group budget', r.status < 300, `${r.status} ${short(r.json)}`);
check('viewer cannot create group budget', (await call(vera, 'POST', '/api/budgets/group', { groupId: g1, category: 'Telephone', monthlyLimit: 50, period: { month: today.getMonth() + 1, year: today.getFullYear() } })).status === 403);
check('group budget usage', (await call(vera, 'GET', `/api/budgets/usage/group/${g1}`)).status === 200);
r = await call(bob, 'POST', '/api/income/personal', { name: 'Contract', category: 'salary', amount: 9000, frequency: 'monthly', isRecurring: true, taxable: true, isActive: true });
check('create income source', r.status < 300, `${r.status} ${short(r.json)}`);
check('list income', (await call(bob, 'GET', '/api/income/personal')).status === 200);
r = await call(bob, 'POST', '/api/income/personal', { name: 'Spoofed', category: 'salary', amount: 1, frequency: 'monthly', isRecurring: false, taxable: true, userId: mallory.uid });
check('income create refuses a forged owner', r.status === 403, `${r.status} ${short(r.json)}`);
r = await call(bob, 'POST', '/api/income/personal', { name: 'Backdated', category: 'salary', amount: 1, frequency: 'monthly', isRecurring: false, taxable: true, createdAt: '1999-01-01', isAdmin: true });
const backdated = r.json?.incomeSource;
check('income create ignores server-owned and unknown fields', r.status < 300 && !JSON.stringify(backdated).includes('1999') && !('isAdmin' in (backdated ?? {})), `${r.status} ${short(backdated)}`);
r = await call(mallory, 'GET', '/api/income/personal');
check('another user\'s income is not visible', !JSON.stringify(r.json).includes('Spoofed') && !JSON.stringify(r.json).includes('Backdated'), short(r.json));
check('list savings', (await call(bob, 'GET', '/api/savings/personal?status=active')).status === 200);

console.log('== conversations');
r = await call(bob, 'POST', '/api/conversations', { title: 'E2E chat', firstMessage: 'hello' });
const convId = r.json?.conversationId ?? r.json?.conversation?.id ?? r.json?.id;
check('create conversation', r.status < 300 && convId, `${r.status} ${short(r.json)}`);
if (convId) {
  r = await call(bob, 'POST', `/api/conversations/${convId}/messages`, { role: 'assistant', content: 'Saved.' });
  check('add message', r.status < 300, `${r.status} ${short(r.json)}`);
  r = await call(bob, 'GET', `/api/conversations/${convId}/messages?limit=100`);
  check('list messages', r.status === 200, `${r.status} ${short(r.json)}`);
  check('stranger cannot read messages', [403, 404].includes((await call(mallory, 'GET', `/api/conversations/${convId}/messages`)).status));
  check('list conversations', (await call(bob, 'GET', '/api/conversations?limit=100')).status === 200);
  check('delete conversation', (await call(bob, 'DELETE', `/api/conversations/${convId}`)).status === 200);
}

console.log('== AI (real Gemini) and receipt photos');
r = await call(bob, 'POST', '/api/analyze-expense', { text: 'Lunch at Subway yesterday for $14.50', localDate: ymd(today) });
const parsed = r.json?.data ?? r.json?.expense ?? r.json;
check('text expense is parsed', r.status === 200 && /14\.5/.test(JSON.stringify(parsed)), `${r.status} ${short(r.json)}`);
notes.push(`text analysis ${r.ms}ms -> ${short(parsed)}`);
r = await call(bob, 'POST', '/api/ai-chat', { message: 'In one short sentence, what can you help me with?', conversationHistory: [] });
check('chat replies', r.status === 200 && JSON.stringify(r.json).length > 30, `${r.status} ${short(r.json)}`);
notes.push(`chat ${r.ms}ms`);
if (receiptsDir) {
  const expected = JSON.parse(fs.readFileSync(`${receiptsDir}/expected.json`, 'utf8'));
  const names = Object.keys(expected);
  const results = await Promise.all(names.map(async (name) => {
    const base64 = fs.readFileSync(`${receiptsDir}/${name}.jpg`).toString('base64');
    const [analysis, upload] = await Promise.all([
      call(bob, 'POST', '/api/analyze-expense', { imageBase64: base64, localDate: ymd(today) }),
      call(bob, 'POST', '/api/media/receipt', { fileName: `${name}.jpg`, contentType: 'image/jpeg', base64 }),
    ]);
    return { name, analysis, upload };
  }));
  for (const { name, analysis, upload } of results) {
    const e = analysis.json?.data ?? analysis.json?.expense ?? analysis.json;
    const x = expected[name];
    const one = Array.isArray(e) ? e[0] : (e?.expenses?.[0] ?? e);
    check(`receipt ${name}: read correctly (${analysis.ms}ms)`, analysis.status === 200 && Math.abs(one?.amount - x.amount) < 0.005 && one?.date === x.date && one?.category === x.category, `${analysis.status} ${short(e)}`);
    check(`receipt ${name}: photo stored (${upload.ms}ms)`, upload.status === 200 && upload.json.url && upload.json.path, `${upload.status} ${short(upload.json)}`);
  }
  const big = Buffer.alloc(5 * 1024 * 1024, 7).toString('base64'); // ~6.7 MB of JSON
  r = await call(bob, 'POST', '/api/media/receipt', { fileName: 'big.jpg', contentType: 'image/jpeg', base64: big });
  check('a 5 MB photo is accepted (not 413)', r.status !== 413 && r.status < 500, `${r.status} ${short(r.json)}`);
  const huge = Buffer.alloc(9 * 1024 * 1024, 7).toString('base64');
  r = await call(bob, 'POST', '/api/media/receipt', { fileName: 'huge.jpg', contentType: 'image/jpeg', base64: huge });
  check('an oversized photo gets a clean 413', r.status === 413, `${r.status}`);
  r = await call(bob, 'POST', '/api/analyze-expense', { imageBase64: Buffer.from('not an image at all').toString('base64') });
  check('an unreadable image gets a clear 4xx, not a 500', r.status >= 400 && r.status < 500, `${r.status} ${short(r.json)}`);
}
r = await call(bob, 'POST', '/api/media/receipt', { fileName: 'x.txt', contentType: 'text/plain', base64: 'aGVsbG8=' });
check('non-image upload is rejected', r.status === 400, `${r.status}`);

console.log('== account deletion');
await call(temp, 'POST', '/api/expenses', expenseBody({ vendor: 'Temp' }));
r = await call(temp, 'DELETE', '/api/account/delete', { confirm: true });
check('account deletion succeeds', r.status === 200, `${r.status} ${short(r.json)}`);
const look = await fetch(`${AUTH}/accounts:lookup?key=local`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: temp.token }) });
check('deleted account is gone from sign-in', look.status !== 200, `${look.status}`);

console.log('== deleting an account that owns groups');
const owen = await signUp('owen');
const pat = await signUp('pat');
r = await call(owen, 'POST', '/api/groups', { name: `Shared ${run}`, userName: 'Owen' });
const shared = r.json?.groupId;
r = await call(owen, 'POST', '/api/groups', { name: `Solo ${run}`, userName: 'Owen' });
const solo = r.json?.groupId;
ia = await inviteAndAccept(owen, shared, pat, 'member');
check('second member joins the shared group', ia.acc?.status === 200, short(ia.acc?.json));
r = await call(owen, 'DELETE', '/api/account/delete', { confirm: true });
check('owner deletes their account', r.status === 200, `${r.status} ${short(r.json)}`);
r = await call(pat, 'GET', `/api/groups/${shared}`);
const sharedGroup = r.json?.group ?? r.json;
check('the shared group passes to the remaining member', r.status === 200 && sharedGroup?.createdBy === pat.uid, `${r.status} ${short(sharedGroup)}`);
check('member count drops to 1', (sharedGroup?.stats?.memberCount) === 1, short(sharedGroup?.stats));
r = await call(pat, 'POST', '/api/expenses', expenseBody({ groupId: shared, expenseType: 'group', vendor: 'After Owner Left' }));
check('new owner can still add group expenses', r.status < 300, `${r.status} ${short(r.json)}`);
r = await call(pat, 'GET', `/api/groups/${solo}`);
check('a group with no one else left is deleted', [403, 404].includes(r.status), `${r.status}`);

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAILED:', f);
console.log('notes:'); for (const n of notes) console.log('  -', n);
process.exit(failures.length ? 1 : 0);
