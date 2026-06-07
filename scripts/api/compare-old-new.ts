const oldBaseUrlEnv = process.env.OLD_API_BASE_URL;
const newBaseUrlEnv = process.env.NEW_API_BASE_URL;
const firebaseIdToken = process.env.FIREBASE_ID_TOKEN;
const cronSecret = process.env.CRON_SECRET;
const parityUserId = process.env.API_PARITY_USER_ID ?? 'parity-user';
const parityGroupId = process.env.API_PARITY_GROUP_ID ?? 'parity-group';
const parityBudgetId = process.env.API_PARITY_BUDGET_ID ?? 'parity-budget';
const parityExpenseId = process.env.API_PARITY_EXPENSE_ID ?? 'parity-expense';
const parityConversationId =
  process.env.API_PARITY_CONVERSATION_ID ?? 'parity-conversation';
const parityMemberId = process.env.API_PARITY_MEMBER_ID ?? 'parity-member';
const allowMutations = process.env.API_PARITY_MUTATE === 'true';

import { apiRouteSurface } from './route-surface';

if (!oldBaseUrlEnv || !newBaseUrlEnv) {
  throw new Error('OLD_API_BASE_URL and NEW_API_BASE_URL are required');
}

const oldBaseUrl = oldBaseUrlEnv;
const newBaseUrl = newBaseUrlEnv;

type Route = (typeof apiRouteSurface)[number];

function materializePath(route: Route) {
  const pathId = route.path.startsWith('/api/expenses/')
    ? parityExpenseId
    : parityBudgetId;

  return route.path
    .replace('{id}', pathId)
    .replace('{groupId}', parityGroupId)
    .replace('{memberId}', parityMemberId)
    .replace('{conversationId}', parityConversationId);
}

function withSafeQuery(route: Route) {
  const url = new URL(materializePath(route), newBaseUrl);
  if (route.auth === 'firebase') {
    url.searchParams.set('userId', parityUserId);
  }
  if (route.path === '/api/budgets/group') {
    url.searchParams.set('groupId', parityGroupId);
  }
  return `${url.pathname}${url.search}`;
}

function mutationPayload(route: Route) {
  if (route.path === '/api/expenses') {
    return {
      userId: parityUserId,
      vendor: 'API Parity',
      amount: 1,
      date: '2026-06-06',
      category: 'Office expenses',
    };
  }
  if (route.path === '/api/groups') {
    return { userId: parityUserId, name: 'API Parity Group' };
  }
  if (route.path.includes('/budgets/')) {
    return {
      userId: parityUserId,
      groupId: parityGroupId,
      category: 'Office expenses',
      monthlyLimit: 100,
      period: { month: 6, year: 2026 },
    };
  }
  if (route.path === '/api/conversations') {
    return {
      userId: parityUserId,
      title: 'API parity',
      firstMessage: 'Parity check',
    };
  }
  if (route.path.endsWith('/messages')) {
    return {
      userId: parityUserId,
      role: 'user',
      content: 'Parity check',
    };
  }
  if (route.path === '/api/ai-chat') {
    return { userId: parityUserId, message: 'Parity check' };
  }
  if (route.path === '/api/analyze-expense') {
    return { userId: parityUserId, text: 'Coffee 4.50' };
  }
  return { userId: parityUserId };
}

async function fetchJson(baseUrl: string, path: string, route: Route) {
  const headers: Record<string, string> = {};
  if (route.auth === 'firebase' && firebaseIdToken) {
    headers.authorization = `Bearer ${firebaseIdToken}`;
  }
  if (route.auth === 'cron' && cronSecret) {
    headers.authorization = `Bearer ${cronSecret}`;
  }

  const shouldSendBody =
    allowMutations && !['GET', 'DELETE'].includes(route.method);
  if (shouldSendBody) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(new URL(path, baseUrl), {
    method: route.method,
    headers,
    body: shouldSendBody ? JSON.stringify(mutationPayload(route)) : undefined,
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

function isSafeComparable(route: Route) {
  if (route.path === '/api/readyz') return false;
  if (route.auth === 'none') return true;
  if (route.auth === 'firebase') {
    return route.method === 'GET' && Boolean(firebaseIdToken);
  }
  return route.auth === 'cron' && Boolean(cronSecret);
}

async function main() {
  for (const route of apiRouteSurface) {
    const path = withSafeQuery(route);

    if (!isSafeComparable(route)) {
      const newResult = await fetchJson(newBaseUrl, path, route);
      if (newResult.status === 404) {
        throw new Error(`${route.method} ${path} is missing on new API`);
      }
      console.log(
        `${route.method} ${path} new API route present (${newResult.status})`,
      );
      continue;
    }

    const oldPath = path;
    const [oldResult, newResult] = await Promise.all([
      fetchJson(oldBaseUrl, oldPath, route),
      fetchJson(newBaseUrl, path, route),
    ]);

    if (oldResult.status !== newResult.status) {
      throw new Error(
        `${route.method} ${path} status mismatch: old=${oldResult.status} new=${newResult.status}`,
      );
    }

    console.log(`${route.method} ${path} parity status ${oldResult.status}`);
  }
}

void main();

export {};
