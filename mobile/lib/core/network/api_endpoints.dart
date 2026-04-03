/// Next.js API route constants.
/// Only routes that require server-side processing (AI, complex transactions).
abstract final class ApiEndpoints {
  static const aiChat = '/api/ai-chat';
  static const analyzeExpense = '/api/analyze-expense';
  static const expenses = '/api/expenses';
  static const groups = '/api/groups';
  static String groupById(String id) => '/api/groups/$id';
  static String groupMembers(String id) => '/api/groups/$id/members';
  static const acceptInvitation = '/api/groups/invitations/accept';
  static const groupBudgets = '/api/budgets/group';
}
