import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../../app';

const routeSurface = [
  ['POST', '/api/ai-chat'],
  ['POST', '/api/analyze-expense'],
  ['POST', '/api/expenses'],
  ['PATCH', '/api/expenses/expense-1'],
  ['DELETE', '/api/expenses/expense-1'],
  ['GET', '/api/groups'],
  ['POST', '/api/groups'],
  ['PATCH', '/api/groups/group-1'],
  ['DELETE', '/api/groups/group-1'],
  ['GET', '/api/groups/group-1/members'],
  ['POST', '/api/groups/group-1/members'],
  ['PATCH', '/api/groups/group-1/members/member-1'],
  ['PUT', '/api/groups/group-1/members/member-1'],
  ['DELETE', '/api/groups/group-1/members/member-1?action=remove'],
  ['POST', '/api/groups/invitations/accept'],
  ['POST', '/api/groups/group-1/archive'],
  ['POST', '/api/groups/group-1/leave'],
  ['GET', '/api/budgets/personal'],
  ['POST', '/api/budgets/personal'],
  ['PUT', '/api/budgets/personal/budget-1'],
  ['DELETE', '/api/budgets/personal/budget-1'],
  ['GET', '/api/budgets/group?groupId=group-1'],
  ['POST', '/api/budgets/group'],
  ['GET', '/api/budgets/usage/personal'],
  ['GET', '/api/budgets/usage/group/group-1'],
  ['GET', '/api/conversations'],
  ['POST', '/api/conversations'],
  ['GET', '/api/conversations/conversation-1'],
  ['POST', '/api/conversations/conversation-1/messages'],
  ['POST', '/api/conversations/conversation-1/generate-title'],
  ['GET', '/api/user/default-group'],
  ['POST', '/api/user/default-group'],
  ['DELETE', '/api/user/default-group'],
  ['DELETE', '/api/account/delete'],
  ['POST', '/api/privacy/delete-my-data'],
  ['GET', '/api/cron/store-metrics'],
] as const;

describe('container API route surface', () => {
  it.each(routeSurface)('%s %s is registered', async (method, url) => {
    const app = await buildApiApp({ readyCheck: async () => undefined });
    const response = await app.inject({ method, url });

    expect(response.statusCode, `${method} ${url}`).not.toBe(404);

    await app.close();
  });
});
