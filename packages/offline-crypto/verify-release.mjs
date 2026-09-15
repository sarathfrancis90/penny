// Maintainer/build source verification using Node's independent OpenSSL backend.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const requireTrue = (ok, message) => { if (!ok) throw new Error(message); };
const decode = (value, length) => {
  const bytes = Buffer.from(value, 'base64');
  requireTrue(bytes.length === length && bytes.toString('base64') === value, 'Invalid signature encoding');
  return bytes;
};

export function verifyRelease(archive, signature, manifest) {
  requireTrue(manifest.schemaVersion === 1 && manifest.name === 'libsodium', 'Unsupported source manifest');
  requireTrue(archive.length === manifest.archive.sizeBytes && archive.length <= 3 * 1024 * 1024, 'Invalid archive size');
  requireTrue(sha256(archive) === manifest.archive.sha256, 'Archive digest mismatch');
  requireTrue(signature.length <= 4096 && sha256(signature) === manifest.signature.sha256, 'Signature digest mismatch');
  const lines = new TextDecoder('utf-8', { fatal: true }).decode(signature).trimEnd().split('\n');
  requireTrue(lines.length === 4 && lines[0].startsWith('untrusted comment: ') && lines[2].startsWith('trusted comment: '), 'Invalid minisign packet');
  const key = decode(manifest.signature.publicKey, 42);
  const packet = decode(lines[1], 74);
  requireTrue(key.subarray(0, 2).equals(Buffer.from('Ed')) && packet.subarray(0, 2).equals(Buffer.from('ED')) && packet.subarray(2, 10).equals(key.subarray(2, 10)), 'Unsupported minisign algorithm or key identity');
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]), format: 'der', type: 'spki' });
  const fileSignature = packet.subarray(10);
  const digest = createHash('blake2b512').update(archive).digest();
  requireTrue(verify(null, digest, publicKey, fileSignature), 'Archive signature verification failed');
  const comment = lines[2].slice('trusted comment: '.length);
  requireTrue(verify(null, Buffer.concat([fileSignature, Buffer.from(comment)]), publicKey, decode(lines[3], 64)), 'Trusted comment signature verification failed');
  const filename = new URL(manifest.archive.url).pathname.split('/').at(-1);
  requireTrue(comment.split('\t').includes(`file:${filename}`) && comment.split('\t').includes('hashed'), 'Signed archive filename mismatch');
  return { version: manifest.version, archiveSha256: manifest.archive.sha256, signature: 'verified', trustedComment: comment };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireTrue(process.argv.length === 3, 'Usage: node verify-release.mjs /path/to/libsodium-1.0.22.tar.gz');
    const manifest = JSON.parse(readFileSync(new URL('./source-manifest.json', import.meta.url), 'utf8'));
    const archiveInfo = statSync(process.argv[2]);
    requireTrue(archiveInfo.isFile() && archiveInfo.size === manifest.archive.sizeBytes, 'Invalid archive size or type');
    const result = verifyRelease(readFileSync(process.argv[2]), readFileSync(new URL(`./${manifest.signature.file}`, import.meta.url)), manifest);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`Release verification failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
