const defaultTimeoutMs = Number(process.env.REQUIRED_CHECK_TIMEOUT_SECONDS || 3600) * 1000;
const defaultPollMs = Number(process.env.REQUIRED_CHECK_POLL_SECONDS || 15) * 1000;

function parseRequiredChecks(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function checkRunTimestamp(run) {
  const value = run.started_at || run.completed_at || run.created_at;
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function newestCheckRun(runs) {
  return [...runs].sort((a, b) => checkRunTimestamp(b) - checkRunTimestamp(a))[0];
}

function evaluateRequiredChecks(checkRuns, requiredChecks) {
  const failures = [];
  const pending = [];
  const passed = [];

  for (const checkName of requiredChecks) {
    const runs = checkRuns.filter((run) => run.name === checkName);
    if (runs.length === 0) {
      pending.push(`${checkName}: missing`);
      continue;
    }

    const latestRun = newestCheckRun(runs);
    if (latestRun.status !== 'completed') {
      pending.push(`${checkName}: ${latestRun.status}`);
      continue;
    }

    if (latestRun.conclusion === 'success') {
      passed.push(checkName);
      continue;
    }

    failures.push(`${checkName}: ${latestRun.conclusion || 'unknown conclusion'}`);
  }

  return {
    complete: pending.length === 0,
    success: pending.length === 0 && failures.length === 0,
    failures,
    passed,
    pending,
  };
}

async function fetchCheckRuns({ repository, sha, token }) {
  const url = `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?per_page=100&filter=latest`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub check-runs API returned ${response.status}: ${body}`);
  }

  const payload = await response.json();
  return payload.check_runs || [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyRequiredChecks({
  repository,
  sha,
  token,
  requiredChecks,
  timeoutMs = defaultTimeoutMs,
  pollMs = defaultPollMs,
  fetchRuns = fetchCheckRuns,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastEvaluation;

  while (Date.now() <= deadline) {
    const checkRuns = await fetchRuns({ repository, sha, token });
    lastEvaluation = evaluateRequiredChecks(checkRuns, requiredChecks);

    if (lastEvaluation.success) {
      return lastEvaluation;
    }

    if (lastEvaluation.failures.length > 0) {
      throw new Error(`Required checks failed:\n${lastEvaluation.failures.join('\n')}`);
    }

    console.log(`Waiting for required checks:\n${lastEvaluation.pending.join('\n')}`);
    await sleep(pollMs);
  }

  throw new Error(
    `Timed out waiting for required checks:\n${(lastEvaluation?.pending || requiredChecks).join('\n')}`,
  );
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const token = process.env.GITHUB_TOKEN;
  const requiredChecks = parseRequiredChecks(process.env.REQUIRED_CHECKS);

  if (!repository) throw new Error('GITHUB_REPOSITORY is required');
  if (!sha) throw new Error('GITHUB_SHA is required');
  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (requiredChecks.length === 0) throw new Error('REQUIRED_CHECKS must list at least one check');

  const result = await verifyRequiredChecks({ repository, sha, token, requiredChecks });
  console.log(`Verified required checks: ${result.passed.join(', ')}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  evaluateRequiredChecks,
  parseRequiredChecks,
  verifyRequiredChecks,
};
