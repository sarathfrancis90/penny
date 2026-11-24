import { describe, expect, it } from 'vitest';

import { FakeFirestore } from '../../test-support/fake-firestore';
import { createFirestoreConversationService } from '../firestore-conversations';

describe('deleting a conversation', () => {
  it('deletes more than 500 messages in batches under the limit, then the conversation', async () => {
    const db = new FakeFirestore();
    db.seed('conversations/conversation-1', { userId: 'user-1' });
    db.seed('conversations/conversation-2', { userId: 'user-1' });
    db.seed('conversations/conversation-2/messages/keep', { content: 'keep' });
    for (let index = 0; index < 1000; index += 1) {
      db.seed(`conversations/conversation-1/messages/m-${index}`, { content: 'x' });
    }
    const service = createFirestoreConversationService(db as never);

    await expect(
      service.deleteConversation({ conversationId: 'conversation-1', userId: 'user-1' }),
    ).resolves.toEqual({ success: true });

    expect(Math.max(...db.batchSizes)).toBeLessThanOrEqual(450);
    expect(db.paths('conversations/conversation-1/messages')).toHaveLength(0);
    expect(db.read('conversations/conversation-1')).toBeUndefined();
    expect(db.read('conversations/conversation-2/messages/keep')).toBeDefined();
  });

  it('keeps the conversation when deleting its messages fails part-way', async () => {
    const db = new FakeFirestore();
    db.seed('conversations/conversation-1', { userId: 'user-1' });
    for (let index = 0; index < 600; index += 1) {
      db.seed(`conversations/conversation-1/messages/m-${index}`, { content: 'x' });
    }
    db.failCommitAt = 1;
    const service = createFirestoreConversationService(db as never);

    await expect(
      service.deleteConversation({ conversationId: 'conversation-1', userId: 'user-1' }),
    ).rejects.toThrow('simulated batch commit failure');
    expect(db.read('conversations/conversation-1')).toBeDefined();

    await service.deleteConversation({ conversationId: 'conversation-1', userId: 'user-1' });
    expect(db.read('conversations/conversation-1')).toBeUndefined();
    expect(db.paths('conversations/conversation-1/messages')).toHaveLength(0);
  });
});
