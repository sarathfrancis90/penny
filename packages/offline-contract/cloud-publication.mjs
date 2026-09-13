// Pure protocol model. No transport, credentials, filesystem access or deletion.
import { isDeepStrictEqual } from 'node:util';
import { requireThat, validTimestamp } from './contract.mjs';
import { openManifest, requireBinding, sha256, validateManifest, verifyReferencedSnapshot } from './cloud-manifest.mjs';

export const publicationPhases = ['snapshotUpload', 'snapshotDownload', 'manifestUpload', 'manifestDownload'];
function validContext(context) {
  requireThat(Number.isSafeInteger(context.sessionEpoch) && context.sessionEpoch >= 0 && Number.isSafeInteger(context.localRevision) && context.localRevision >= 0 && typeof context.cancelled === 'boolean', 'invalid_publication_context');
}
export function beginPublication({ operationId, manifest, snapshotBytes, recoveryText, context, lastGood = null }) {
  validContext(context); validateManifest(manifest); requireBinding(manifest, context);
  requireThat(context.vaultTag === manifest.vaultTag, 'vault_selection_required');
  requireThat(typeof operationId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(operationId), 'invalid_operation_id');
  requireThat(!context.cancelled && context.localRevision === manifest.localRevision, 'stale_staging');
  verifyReferencedSnapshot(snapshotBytes, recoveryText, manifest);
  if (lastGood !== null) {
    validateManifest(lastGood); requireBinding(lastGood, context);
    requireThat(lastGood.writerId === manifest.writerId && lastGood.localRevision <= manifest.localRevision, 'invalid_last_good');
  }
  requireThat(manifest.previousManifestId === (lastGood?.manifestId ?? null), 'invalid_last_good');
  return {
    operationId, phase: 'snapshotUpload', manifest: structuredClone(manifest), manifestDigest: null,
    binding: { provider: context.provider, accountTag: context.accountTag, vaultTag: manifest.vaultTag, sessionEpoch: context.sessionEpoch },
    lastGood: structuredClone(lastGood), error: null, verifiedAt: null,
  };
}
function guard(state, context) {
  validContext(context);
  if (context.cancelled) return 'cancelled';
  if (context.provider !== state.binding.provider || context.accountTag !== state.binding.accountTag || context.sessionEpoch !== state.binding.sessionEpoch || context.vaultTag !== state.binding.vaultTag) return 'account_or_vault_changed';
  if (context.localRevision < state.manifest.localRevision) return 'revision_regressed';
  return null;
}
export function publicationEffect(state, context) {
  if (!publicationPhases.includes(state.phase) || guard(state, context)) return null;
  return { operationId: state.operationId, phase: state.phase, objectId: state.phase.startsWith('snapshot') ? state.manifest.snapshot.objectId : state.manifest.manifestId, immutable: true };
}
export function advancePublication(state, event, context, recoveryText) {
  if (event.operationId !== state.operationId || !publicationPhases.includes(state.phase)) return structuredClone(state);
  const next = structuredClone(state), blocked = guard(state, context);
  if (blocked) return { ...next, phase: 'aborted', error: blocked };
  if (event.phase !== state.phase) return next; // Duplicate/stale completion cannot skip a phase.
  if (event.kind === 'failed') return { ...next, phase: 'failed', error: 'provider_failure' };
  requireThat(event.kind === 'completed', 'invalid_completion');
  try {
    if (state.phase === 'snapshotDownload') {
      verifyReferencedSnapshot(event.bytes, recoveryText, state.manifest);
      // The adapter stages the manifest only after snapshot download verification.
      // Supplied event bytes keep this reducer deterministic; it generates no nonce.
      requireThat(validTimestamp(event.verifiedAt) && validTimestamp(event.createdAt), 'invalid_verification_time');
      const actual = openManifest(event.manifestBytes, recoveryText, state.binding);
      requireThat(isDeepStrictEqual(actual, { ...state.manifest, verifiedAt: event.verifiedAt, createdAt: event.createdAt }), 'manifest_staging_mismatch');
      next.manifest = actual; next.manifestDigest = sha256(event.manifestBytes);
    }
    if (state.phase === 'manifestDownload') {
      requireThat(sha256(event.bytes) === state.manifestDigest, 'manifest_readback_mismatch');
      const actual = openManifest(event.bytes, recoveryText, state.binding);
      requireThat(isDeepStrictEqual(actual, state.manifest), 'manifest_readback_mismatch');
      requireThat(validTimestamp(event.verifiedAt), 'invalid_verification_time');
      return { ...next, phase: 'verified', lastGood: structuredClone(actual), verifiedAt: event.verifiedAt };
    }
    return { ...next, phase: publicationPhases[publicationPhases.indexOf(state.phase) + 1] };
  } catch {
    return { ...next, phase: 'failed', error: 'verification_failed' };
  }
}
export function publicationStatus(state, context) {
  const sameBinding = context.provider === state.binding.provider && context.accountTag === state.binding.accountTag && context.vaultTag === state.binding.vaultTag && context.sessionEpoch === state.binding.sessionEpoch;
  const current = sameBinding && state.lastGood?.writerId === state.manifest.writerId && state.lastGood.localRevision === context.localRevision;
  return { phase: state.phase, backedUpRevision: sameBinding ? state.lastGood?.localRevision ?? null : null, pendingChanges: !current, currentVaultVerified: Boolean(current), automaticDeletionAllowed: false };
}
