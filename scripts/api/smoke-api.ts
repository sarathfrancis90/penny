const baseUrl = process.env.API_BASE_URL;
const firebaseIdToken = process.env.FIREBASE_ID_TOKEN;

if (!baseUrl) {
  throw new Error('API_BASE_URL is required');
}

async function check(path: string, init?: RequestInit) {
  const response = await fetch(new URL(path, baseUrl), init);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  console.log(`${path} ${response.status}`);
}

async function checkProtected(path: string, method: string) {
  const response = await fetch(new URL(path, baseUrl), { method });
  if (response.status === 404) {
    throw new Error(`${method} ${path} is not registered`);
  }
  if (response.status !== 401) {
    throw new Error(`${method} ${path} expected 401 without token, got ${response.status}`);
  }
  console.log(`${method} ${path} auth gate ${response.status}`);
}

async function main() {
  await check('/api/healthz');
  await check('/api/readyz');
  await checkProtected('/api/groups', 'GET');
  await checkProtected('/api/expenses', 'POST');
  await checkProtected('/api/budgets/personal', 'GET');
  await checkProtected('/api/conversations', 'GET');

  if (firebaseIdToken) {
    await check('/api/groups', {
      headers: { authorization: `Bearer ${firebaseIdToken}` },
    });
  }
}

void main();

export {};
