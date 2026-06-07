import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';

import type {
  AddMessageInput,
  ConversationService,
  CreateConversationInput,
  UpdateConversationInput,
} from './conversations';

async function getOwnedConversation(
  db: Firestore,
  conversationId: string,
  userId: string,
) {
  const ref = db.collection('conversations').doc(conversationId);
  const doc = await ref.get();
  if (!doc.exists) {
    throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
  }

  const data = doc.data() ?? {};
  if (data.userId !== userId) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
  }

  return { ref, doc, data };
}

export function createFirestoreConversationService(
  db: Firestore,
): ConversationService {
  return {
    async listConversations(input) {
      const limit = input.limit ?? 20;
      let query: Query = db
        .collection('conversations')
        .where('userId', '==', input.userId);
      if (!input.includeArchived) {
        query = query.where('status', '==', 'active');
      }

      const snapshot = await query.orderBy('updatedAt', 'desc').limit(limit).get();
      const conversations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        conversations,
        total: conversations.length,
        hasMore: conversations.length === limit,
      };
    },

    async createConversation(input: CreateConversationInput) {
      const now = Timestamp.now();
      const conversationRef = db.collection('conversations').doc();
      const messageRef = conversationRef.collection('messages').doc();

      const conversationData = {
        userId: input.userId,
        title: input.title.substring(0, 100),
        createdAt: now,
        updatedAt: now,
        lastMessagePreview: input.firstMessage.substring(0, 100),
        messageCount: 1,
        status: 'active',
        totalExpensesCreated: 0,
        metadata: {
          firstMessageTimestamp: now,
          lastAccessedAt: now,
          isPinned: false,
        },
      };
      const messageData = {
        conversationId: conversationRef.id,
        role: input.firstMessageRole ?? 'user',
        content: input.firstMessage,
        timestamp: now,
        status: 'sent',
      };

      const batch = db.batch();
      batch.set(conversationRef, conversationData);
      batch.set(messageRef, messageData);
      await batch.commit();

      return {
        success: true,
        conversationId: conversationRef.id,
        messageId: messageRef.id,
      };
    },

    async getConversation(input) {
      const { ref, doc, data } = await getOwnedConversation(
        db,
        input.conversationId,
        input.userId,
      );
      const messagesSnapshot = await ref
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .get();

      return {
        conversation: { id: doc.id, ...data },
        messages: messagesSnapshot.docs.map((messageDoc) => ({
          id: messageDoc.id,
          ...messageDoc.data(),
        })),
      };
    },

    async updateConversation(input: UpdateConversationInput) {
      const { ref } = await getOwnedConversation(
        db,
        input.conversationId,
        input.userId,
      );
      const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };
      if (input.title !== undefined) updates.title = input.title.substring(0, 100);
      if (input.summary !== undefined) updates.summary = input.summary;
      if (input.status !== undefined) updates.status = input.status;
      if (input.isPinned !== undefined) {
        updates['metadata.isPinned'] = input.isPinned;
      }

      await ref.update(updates);
      return { success: true };
    },

    async deleteConversation(input) {
      const { ref } = await getOwnedConversation(
        db,
        input.conversationId,
        input.userId,
      );
      const messagesSnapshot = await ref.collection('messages').get();
      const batch = db.batch();
      messagesSnapshot.docs.forEach((messageDoc) => batch.delete(messageDoc.ref));
      batch.delete(ref);
      await batch.commit();
      return { success: true };
    },

    async listMessages(input) {
      const { ref } = await getOwnedConversation(
        db,
        input.conversationId,
        input.userId,
      );
      const limit = input.limit ?? 50;
      let query: Query = ref.collection('messages').orderBy('timestamp', 'asc');
      if (input.before) {
        query = query.where('timestamp', '<', Timestamp.fromMillis(input.before));
      }

      const snapshot = await query.limit(limit).get();
      const messages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        messages,
        hasMore: messages.length === limit,
      };
    },

    async addMessage(input: AddMessageInput) {
      const messageRef = db
        .collection('conversations')
        .doc(input.conversationId)
        .collection('messages')
        .doc();
      const now = Timestamp.now();

      await db.runTransaction(async (transaction) => {
        const conversationRef = db
          .collection('conversations')
          .doc(input.conversationId);
        const conversationDoc = await transaction.get(conversationRef);
        if (!conversationDoc.exists) {
          throw Object.assign(new Error('Conversation not found'), {
            statusCode: 404,
          });
        }
        const conversation = conversationDoc.data() ?? {};
        if (conversation.userId !== input.userId) {
          throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
        }

        const messageData: Record<string, unknown> = {
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          timestamp: now,
          status: 'sent',
        };
        if (input.attachments) messageData.attachments = input.attachments;
        if (input.expenseData) messageData.expenseData = input.expenseData;
        if (input.metadata) messageData.metadata = input.metadata;

        transaction.set(messageRef, messageData);
        transaction.update(conversationRef, {
          updatedAt: now,
          lastMessagePreview: input.content.substring(0, 100),
          messageCount: FieldValue.increment(1),
          ...(input.expenseData?.confirmed
            ? { totalExpensesCreated: FieldValue.increment(1) }
            : {}),
        });
      });

      return { success: true, messageId: messageRef.id };
    },
  };
}
