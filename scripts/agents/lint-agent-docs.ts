import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = process.cwd();
const docsDirs = ['docs/agents', 'docs/api'];
const sensitivePatterns = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /\b1:\d{12}:web:[0-9a-f]{20,}\b/,
  /\b1:\d{12}:ios:[0-9a-f]{20,}\b/,
  /\b1:\d{12}:android:[0-9a-f]{20,}\b/,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
];

function walk(dir: string): string[] {
  const absoluteDir = join(rootDir, dir);
  return readdirSync(absoluteDir).flatMap((entry) => {
    const relativePath = `${dir}/${entry}`;
    const absolutePath = join(rootDir, relativePath);
    if (statSync(absolutePath).isDirectory()) return walk(relativePath);
    return relativePath.endsWith('.md') || relativePath.endsWith('.json')
      ? [relativePath]
      : [];
  });
}

const failures: string[] = [];
for (const file of docsDirs.flatMap(walk)) {
  const content = readFileSync(join(rootDir, file), 'utf8');
  for (const pattern of sensitivePatterns) {
    if (pattern.test(content)) {
      failures.push(`${file} matches sensitive value pattern ${pattern}`);
    }
  }

  for (const match of content.matchAll(/`((?:\.github|apps|database|docs|mobile|packages|scripts|src)\/[^`]+)`/g)) {
    const reference = match[1];
    if (
      reference.includes('*') ||
      reference.includes('{') ||
      reference.includes('$') ||
      reference.includes(' ') ||
      reference.includes('<') ||
      reference.includes('>')
    ) {
      continue;
    }

    const normalized = reference.replace(/:\d+$/, '');
    if (!statExists(normalized)) {
      failures.push(`${file} references missing path ${reference}`);
    }
  }
}

function statExists(relativePath: string) {
  try {
    statSync(join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

if (failures.length > 0) {
  throw new Error(`Agent docs lint failed:\n${failures.join('\n')}`);
}

console.log('Agent docs lint passed.');
