// Portable cloud metadata reference only. Provider adapters own authorization and IO.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { canonicalBase64, exactKeys, limits, openBackup, parseRecoveryKey, parseStrictJSON, requireThat, validTimestamp, validUnicode } from './contract.mjs';

export const cloudLimits = Object.freeze({ plaintextBytes: 8192, envelopeBytes: 12288, pageItems: 100, pages: 10, listedObjects: 1000, manifests: 100 });
export const manifestAAD = Buffer.from('PENNY-OFFLINE-CLOUD-MANIFEST:1', 'utf8');
export const manifestKeys = ['schemaVersion', 'manifestId', 'provider', 'accountTag', 'vaultTag', 'writerId', 'localRevision', 'createdAt', 'verifiedAt', 'previousManifestId', 'snapshot'];
export const descriptorKeys = ['objectId', 'snapshotId', 'envelopeVersion', 'snapshotSchemaVersion', 'sha256', 'byteCount', 'createdAt'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest = /^[0-9a-f]{64}$/;
const isUUID = value => typeof value === 'string' && uuid.test(value);
const isDigest = value => typeof value === 'string' && digest.test(value);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function accountTag(provider, opaqueIdentity) {
  requireThat(['icloud', 'drive'].includes(provider), 'unsupported_provider');
  requireThat(validUnicode(opaqueIdentity) && [...opaqueIdentity].length >= 1 && [...opaqueIdentity].length <= 1024 && ![...opaqueIdentity].some(c => c.codePointAt(0) < 32 || c.codePointAt(0) === 127), 'invalid_opaque_identity');
  // The adapter must supply a provider-issued opaque identity, never email/token.
  return sha256(Buffer.from(`PENNY-OFFLINE-CLOUD-ACCOUNT:1\0${provider}\0${opaqueIdentity}`, 'utf8'));
}
export function vaultTag(vaultId) {
  requireThat(isUUID(vaultId), 'invalid_vault_id');
  return sha256(Buffer.from(`PENNY-OFFLINE-CLOUD-VAULT:1\0${vaultId}`, 'utf8'));
}
export function validateManifest(value) {
  exactKeys(value, manifestKeys);
  requireThat(value.schemaVersion === 1, 'unsupported_manifest_schema');
  requireThat(isUUID(value.manifestId) && isUUID(value.writerId), 'invalid_uuid');
  requireThat(['icloud', 'drive'].includes(value.provider), 'unsupported_provider');
  requireThat(isDigest(value.accountTag) && isDigest(value.vaultTag), 'invalid_binding_tag');
  requireThat(Number.isSafeInteger(value.localRevision) && value.localRevision >= 0, 'invalid_revision');
  requireThat(validTimestamp(value.createdAt) && validTimestamp(value.verifiedAt), 'invalid_timestamp');
  requireThat(value.previousManifestId === null || isUUID(value.previousManifestId) && value.previousManifestId !== value.manifestId, 'invalid_previous_manifest');
  exactKeys(value.snapshot, descriptorKeys);
  const s = value.snapshot;
  requireThat(isUUID(s.objectId) && isUUID(s.snapshotId), 'invalid_uuid');
  requireThat(s.envelopeVersion === 1 && [1, 2, 3].includes(s.snapshotSchemaVersion), 'unsupported_snapshot_version');
  requireThat(isDigest(s.sha256), 'invalid_digest');
  requireThat(Number.isSafeInteger(s.byteCount) && s.byteCount > 0 && s.byteCount <= limits.envelopeBytes, 'invalid_snapshot_size');
  requireThat(validTimestamp(s.createdAt), 'invalid_timestamp');
  requireThat(Buffer.byteLength(JSON.stringify(value)) <= cloudLimits.plaintextBytes, 'manifest_plaintext_limit');
  return value;
}
export function requireBinding(manifest, binding) {
  requireThat(manifest.provider === binding.provider && manifest.accountTag === binding.accountTag && (binding.vaultTag === undefined || manifest.vaultTag === binding.vaultTag), 'cloud_binding_mismatch');
}
const base64 = canonicalBase64;
export function validateManifestEnvelope(value) {
  exactKeys(value, ['formatVersion', 'algorithm', 'nonce', 'ciphertext', 'tag']);
  requireThat(value.formatVersion === 1 && value.algorithm === 'AES-256-GCM', 'unsupported_manifest_envelope');
  base64(value.nonce, 12); base64(value.tag, 16);
  requireThat(typeof value.ciphertext === 'string' && value.ciphertext.length <= 4 * Math.ceil(cloudLimits.plaintextBytes / 3), 'manifest_ciphertext_limit');
  const bytes = base64(value.ciphertext);
  requireThat(bytes.length > 0 && bytes.length <= cloudLimits.plaintextBytes, 'manifest_ciphertext_limit');
  return value;
}
export function sealManifestForTest(manifest, recoveryText, nonce) {
  const plaintext = Buffer.from(JSON.stringify(validateManifest(manifest)), 'utf8');
  requireThat(nonce?.length === 12, 'invalid_nonce');
  const cipher = createCipheriv('aes-256-gcm', parseRecoveryKey(recoveryText), nonce, { authTagLength: 16 });
  cipher.setAAD(manifestAAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = { formatVersion: 1, algorithm: 'AES-256-GCM', nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  requireThat(Buffer.byteLength(JSON.stringify(envelope)) <= cloudLimits.envelopeBytes, 'manifest_envelope_limit');
  return envelope;
}
export function sealManifest(manifest, recoveryText) { return sealManifestForTest(manifest, recoveryText, randomBytes(12)); }
export function openManifest(bytes, recoveryText, binding) {
  const envelope = validateManifestEnvelope(parseStrictJSON(bytes, cloudLimits.envelopeBytes));
  const decipher = createDecipheriv('aes-256-gcm', parseRecoveryKey(recoveryText), base64(envelope.nonce, 12), { authTagLength: 16 });
  decipher.setAAD(manifestAAD); decipher.setAuthTag(base64(envelope.tag, 16));
  const plaintext = Buffer.concat([decipher.update(base64(envelope.ciphertext)), decipher.final()]);
  const manifest = validateManifest(parseStrictJSON(plaintext, cloudLimits.plaintextBytes));
  requireBinding(manifest, binding);
  return manifest;
}
export function verifyReferencedSnapshot(bytes, recoveryText, manifest) {
  validateManifest(manifest);
  requireThat(bytes.byteLength === manifest.snapshot.byteCount && bytes.byteLength <= limits.envelopeBytes, 'snapshot_size_mismatch');
  requireThat(sha256(bytes) === manifest.snapshot.sha256, 'snapshot_digest_mismatch');
  const snapshot = openBackup(bytes, recoveryText);
  requireThat(snapshot.snapshotId === manifest.snapshot.snapshotId && snapshot.schemaVersion === manifest.snapshot.snapshotSchemaVersion && snapshot.createdAt === manifest.snapshot.createdAt && vaultTag(snapshot.vaultId) === manifest.vaultTag, 'snapshot_descriptor_mismatch');
  return snapshot; // Native callers additionally fully decode receipt images.
}
export function remoteNames(manifest) {
  validateManifest(manifest);
  return { manifest: `manifest-${manifest.manifestId}.pennymanifest`, snapshot: `snapshot-${manifest.snapshot.objectId}.pennybackup` };
}
export function openListedManifest(item, bytes, recoveryText, binding) {
  const manifest = openManifest(bytes, recoveryText, binding);
  requireThat(item.name === remoteNames(manifest).manifest, 'manifest_object_name_mismatch');
  return manifest;
}

// Every returned page counts, including unknown files; no silently truncated history.
export function collectManifestCandidates(pages) {
  requireThat(Array.isArray(pages) && pages.length >= 1 && pages.length <= cloudLimits.pages, 'listing_limit');
  const tokens = new Set(), ids = new Set(), names = new Set(), result = [];
  let total = 0;
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index]; exactKeys(page, ['items', 'nextPageToken']);
    requireThat(Array.isArray(page.items) && page.items.length <= cloudLimits.pageItems, 'listing_limit');
    total += page.items.length; requireThat(total <= cloudLimits.listedObjects, 'listing_limit');
    const token = page.nextPageToken;
    requireThat(token === null || validUnicode(token) && token.length > 0 && [...token].length <= 2048 && !tokens.has(token), 'invalid_page_token');
    if (token !== null) tokens.add(token);
    requireThat((token === null) === (index === pages.length - 1), 'listing_incomplete');
    for (const item of page.items) {
      exactKeys(item, ['id', 'name']);
      requireThat(validUnicode(item.id) && [...item.id].length >= 1 && [...item.id].length <= 1024 && !ids.has(item.id), 'ambiguous_remote_object');
      requireThat(validUnicode(item.name) && [...item.name].length <= 256, 'invalid_remote_name');
      ids.add(item.id);
      if (!/^manifest-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pennymanifest$/.test(item.name)) continue;
      requireThat(!names.has(item.name), 'ambiguous_remote_object'); names.add(item.name);
      result.push({ ...item }); requireThat(result.length <= cloudLimits.manifests, 'manifest_listing_limit');
    }
  }
  return result;
}
export function manifestHistory(manifests, binding) {
  requireThat(isDigest(binding.vaultTag), 'vault_selection_required');
  requireThat(Array.isArray(manifests) && manifests.length <= cloudLimits.manifests, 'manifest_listing_limit');
  const ids = new Set(), groups = new Map();
  for (const value of manifests) {
    validateManifest(value); requireBinding(value, binding);
    requireThat(!ids.has(value.manifestId), 'duplicate_manifest'); ids.add(value.manifestId);
    if (!groups.has(value.writerId)) groups.set(value.writerId, []);
    groups.get(value.writerId).push(structuredClone(value));
  }
  const writers = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([writerId, candidates]) => ({ writerId, candidates: candidates.sort((a, b) => b.localRevision - a.localRevision || a.manifestId.localeCompare(b.manifestId)) }));
  return { writers, multipleWriters: writers.length > 1, revisionConflict: writers.some(({ candidates }) => candidates.some((value, index) => index > 0 && candidates[index - 1].localRevision === value.localRevision && candidates[index - 1].snapshot.sha256 !== value.snapshot.sha256)), automaticDeletionAllowed: false };
}
