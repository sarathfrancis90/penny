export interface ParsedExpense {
  vendor: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  groupId?: string;
  groupName?: string | null;
  confidence?: number;
}

export interface AnalyzeExpenseInput {
  userId: string;
  text?: string;
  imageBase64?: string;
}

export interface ChatInput {
  userId: string;
  message: string;
  conversationHistory: Array<{ role: string; content: string }>;
}

export interface GenerateTitleInput {
  userId: string;
  conversationId: string;
}

export interface AiService {
  analyzeExpense(input: AnalyzeExpenseInput): Promise<ParsedExpense | ParsedExpense[]>;
  chat(input: ChatInput): Promise<string>;
  generateConversationTitle(input: GenerateTitleInput): Promise<string>;
}

export function createUnavailableAiService(): AiService {
  const unavailable = async () => {
    throw Object.assign(new Error('AI service is not configured'), {
      statusCode: 503,
    });
  };

  return {
    analyzeExpense: unavailable,
    chat: unavailable,
    generateConversationTitle: unavailable,
  };
}
