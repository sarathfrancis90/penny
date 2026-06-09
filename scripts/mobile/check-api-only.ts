import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const mobileLib = join(root, 'mobile/lib');
const pubspec = join(root, 'mobile/pubspec.yaml');

const forbiddenCodePatterns = [
  /package:cloud_firestore\/cloud_firestore\.dart/,
  /package:firebase_storage\/firebase_storage\.dart/,
  /\bFirebaseFirestore\b/,
  /\bFirebaseStorage\b/,
  /\bFieldValue\b/,
  /\bSetOptions\b/,
  /\bDocumentSnapshot\b/,
  /\bQuerySnapshot\b/,
  /penny-amber\.vercel\.app/,
  /localhost:3000/,
  /src\/app\/api/,
] as const;

const forbiddenProductionDeps = new Set([
  'cloud_firestore',
  'firebase_storage',
  'fake_cloud_firestore',
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.dart') ? [path] : [];
  });
}

function lineNumber(content: string, index: number) {
  return content.slice(0, index).split('\n').length;
}

const failures: string[] = [];

for (const file of walk(mobileLib)) {
  const content = readFileSync(file, 'utf8');
  for (const pattern of forbiddenCodePatterns) {
    const match = pattern.exec(content);
    if (match?.index !== undefined) {
      failures.push(
        `${relative(root, file)}:${lineNumber(content, match.index)} contains ${pattern}`,
      );
    }
  }
}

const pubspecContent = readFileSync(pubspec, 'utf8');
let inDependencies = false;
for (const [index, line] of pubspecContent.split('\n').entries()) {
  if (line === 'dependencies:') {
    inDependencies = true;
    continue;
  }
  if (line === 'dev_dependencies:') {
    inDependencies = false;
    continue;
  }
  if (!inDependencies) continue;

  const match = /^  ([a-zA-Z0-9_]+):/.exec(line);
  if (match && forbiddenProductionDeps.has(match[1])) {
    failures.push(`mobile/pubspec.yaml:${index + 1} production dependency ${match[1]} is forbidden`);
  }
}

if (failures.length > 0) {
  console.error('Mobile API-only guard failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Mobile API-only guard passed');
