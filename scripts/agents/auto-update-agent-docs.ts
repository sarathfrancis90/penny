import { execFileSync } from 'node:child_process';

const generatedArtifacts = [
  'docs/api/openapi.json',
  'docs/agents/FILE_MAP.md',
  'docs/agents/generated',
] as const;

function run(command: string, args: string[]) {
  execFileSync(command, args, { stdio: 'inherit' });
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function stageGeneratedArtifacts() {
  run('git', ['add', '--', ...generatedArtifacts]);
}

function main() {
  const noStage = hasFlag('--no-stage');
  const skipChecks = hasFlag('--skip-checks');

  run('npm', ['run', 'api:contract:generate']);
  run('npm', ['run', 'docs:agents:generate']);

  if (!noStage) {
    stageGeneratedArtifacts();
  }

  if (!skipChecks) {
    run('npm', ['run', 'api:contract']);
    run('npm', ['run', 'docs:agents:check']);
    run('npm', ['run', 'docs:agents:lint']);
    run('npm', ['run', 'docs:agents:test']);
  }
}

main();
