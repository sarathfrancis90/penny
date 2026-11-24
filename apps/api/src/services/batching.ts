import type { Firestore, WriteBatch } from 'firebase-admin/firestore';

/** Firestore rejects a batch of more than 500 writes; stay well under it. */
export const BATCH_CHUNK_SIZE = 450;

/**
 * Applies one write per item, committing a fresh batch every
 * `BATCH_CHUNK_SIZE` items so large sets do not hit the batch limit.
 */
export async function writeInChunks<T>(
  db: Firestore,
  items: readonly T[],
  apply: (batch: WriteBatch, item: T) => void,
): Promise<void> {
  for (let start = 0; start < items.length; start += BATCH_CHUNK_SIZE) {
    const batch = db.batch();
    for (const item of items.slice(start, start + BATCH_CHUNK_SIZE)) {
      apply(batch, item);
    }
    await batch.commit();
  }
}
