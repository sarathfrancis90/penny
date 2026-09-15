import { readFileSync, writeFileSync } from 'node:fs';
import { sealForTest } from './contract.mjs';
import { accountTag, manifestAAD, sealManifestForTest, sha256, vaultTag } from './cloud-manifest.mjs';
const write = (name, value) => writeFileSync(new URL(`./fixtures/${name}`, import.meta.url), JSON.stringify(value, null, 2) + '\n');
const snapshot = JSON.parse(readFileSync(new URL('./fixtures/snapshot-v3.json', import.meta.url)));
const recoveryKey = 'pny1-1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100';
const snapshotNonceHex = '404142434445464748494a4b';
const nonceHex = '606162636465666768696a6b';
const snapshotEnvelope = sealForTest(snapshot, recoveryKey, Buffer.from(snapshotNonceHex, 'hex'));
const snapshotBytes = Buffer.from(JSON.stringify(snapshotEnvelope));
writeFileSync(new URL('./fixtures/cloud-snapshot-v1.pennybackup', import.meta.url), snapshotBytes);
const manifest = {
  schemaVersion: 1, manifestId: '12345678-1234-4234-8234-123456789abc', provider: 'drive',
  accountTag: accountTag('drive', 'synthetic-opaque-account-01'), vaultTag: vaultTag(snapshot.vaultId),
  writerId: '23456789-2345-4345-8345-23456789abcd', localRevision: 42,
  createdAt: '2026-09-13T12:05:00.000Z', verifiedAt: '2026-09-13T12:04:59.000Z', previousManifestId: null,
  snapshot: { objectId: '3456789a-3456-4456-8456-3456789abcde', snapshotId: snapshot.snapshotId, envelopeVersion: 1, snapshotSchemaVersion: snapshot.schemaVersion, sha256: sha256(snapshotBytes), byteCount: snapshotBytes.length, createdAt: snapshot.createdAt },
};
write('cloud-manifest-v1.json', manifest);
write('cloud-manifest-v1.pennymanifest', sealManifestForTest(manifest, recoveryKey, Buffer.from(nonceHex, 'hex')));
write('cloud-golden-vector-v1.json', { purpose: 'Independent public synthetic cloud test material only; never use these keys or nonces outside tests.', recoveryKey, nonceHex, snapshotNonceHex, aadUtf8: manifestAAD.toString('utf8'), plaintextUtf8: JSON.stringify(manifest), accountInput: { provider: 'drive', opaqueIdentity: 'synthetic-opaque-account-01' }, expectedAccountTag: manifest.accountTag, vaultId: snapshot.vaultId, expectedVaultTag: manifest.vaultTag, snapshotFile: 'cloud-snapshot-v1.pennybackup', expectedSnapshotSha256: manifest.snapshot.sha256 });
write('cloud-conformance-v1.json', {
  manifestMutations: [
    ['future schema', 'schemaVersion', 2], ['fractional schema', 'schemaVersion', 1.5], ['unknown provider', 'provider', 'dropbox'],
    ['email as tag', 'accountTag', 'synthetic@example.invalid'], ['uppercase tag', 'vaultTag', manifest.vaultTag.toUpperCase()],
    ['negative revision', 'localRevision', -1], ['fractional revision', 'localRevision', 0.5], ['unsafe revision', 'localRevision', 9007199254740992],
    ['boolean revision', 'localRevision', true], ['noncanonical UUID', 'writerId', '23456789-2345-4345-8345-23456789ABCD'],
    ['self previous', 'previousManifestId', manifest.manifestId], ['bad time', 'verifiedAt', '2026-02-30T12:00:00.000Z'], ['unknown field', 'email', 'synthetic@example.invalid'],
  ].map(([name, field, value]) => ({ name, field, value })),
  descriptorMutations: [
    ['path instead of ID', 'objectId', '../escape'], ['URL instead of ID', 'objectId', 'https://example.invalid/backup'],
    ['unknown snapshot schema', 'snapshotSchemaVersion', 4], ['unknown envelope', 'envelopeVersion', 2],
    ['empty bytes', 'byteCount', 0], ['over capacity', 'byteCount', 20971521], ['fractional bytes', 'byteCount', 2.5],
    ['wrong digest spelling', 'sha256', 'A'.repeat(64)], ['invalid time', 'createdAt', '2026-01-01'], ['unknown path', 'path', 'snapshot.bin'],
  ].map(([name, field, value]) => ({ name, field, value })),
  awaitPhases: ['snapshotUpload', 'snapshotDownload', 'manifestUpload', 'manifestDownload'],
  failureReasons: ['permission_revoked', 'credentials_expired', 'quota', 'transient', 'cancelled', 'provider_failure'],
  invariants: ['last_good_unchanged_until_manifest_readback', 'account_switch_at_every_await_aborts', 'switch_away_and_back_changes_epoch', 'stale_revision_stays_dirty', 'no_automatic_deletion', 'immutable_interleaved_writers_remain_visible'],
});
