export interface ConversationListInput {
  userId: string;
  limit?: number;
  includeArchived?: boolean;
}

export interface CreateConversationInput {
  userId: string;
  title: string;
  firstMessage: string;
  firstMessageRole?: string;
}

export interface UpdateConversationInput {
  userId: string;
  conversationId: string;
  title?: string;
  summary?: string;
  isPinned?: boolean;
  status?: string;
}

export interface MessageListInput {
  userId: string;
  conversationId: string;
  limit?: number;
  before?: number;
}

export interface AddMessageInput {
  userId: string;
  conversationId: string;
  role: string;
  content: string;
  attachments?: unknown;
  expenseData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ConversationService {
  listConversations(input: ConversationListInput): Promise<{
    conversations: Record<string, unknown>[];
    total: number;
    hasMore: boolean;
  }>;
  createConversation(input: CreateConversationInput): Promise<{
    success: true;
    conversationId: string;
    messageId: string;
  }>;
  getConversation(input: {
    userId: string;
    conversationId: string;
  }): Promise<{
    conversation: Record<string, unknown>;
    messages: Record<string, unknown>[];
  }>;
  updateConversation(input: UpdateConversationInput): Promise<{ success: true }>;
  deleteConversation(input: {
    userId: string;
    conversationId: string;
  }): Promise<{ success: true }>;
  listMessages(input: MessageListInput): Promise<{
    messages: Record<string, unknown>[];
    hasMore: boolean;
  }>;
  addMessage(input: AddMessageInput): Promise<{
    success: true;
    messageId: string;
  }>;
}

export function createUnavailableConversationService(): ConversationService {
  const unavailable = async () => {
    throw Object.assign(new Error('Conversation service is not configured'), {
      statusCode: 503,
    });
  };

  return {
    listConversations: unavailable,
    createConversation: unavailable,
    getConversation: unavailable,
    updateConversation: unavailable,
    deleteConversation: unavailable,
    listMessages: unavailable,
    addMessage: unavailable,
  };
}
