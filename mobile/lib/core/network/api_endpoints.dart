/// Standalone API route constants.
abstract final class ApiEndpoints {
  static const aiChat = '/api/ai-chat';
  static const analyzeExpense = '/api/analyze-expense';
  static const expenses = '/api/expenses';
  static String expenseById(String id) => '/api/expenses/$id';
  static const duplicateExpense = '/api/expenses/duplicate-check';
  static String approveExpense(String id) => '/api/expenses/$id/approve';
  static String rejectExpense(String id) => '/api/expenses/$id/reject';
  static const groups = '/api/groups';
  static String groupById(String id) => '/api/groups/$id';
  static String groupActivities(String id) => '/api/groups/$id/activities';
  static String myGroupMembership(String id) => '/api/groups/$id/membership/me';
  static String groupMembers(String id) => '/api/groups/$id/members';
  static String groupLeave(String id) => '/api/groups/$id/leave';
  static const acceptInvitation = '/api/groups/invitations/accept';
  static String declineInvitation(String id) =>
      '/api/groups/invitations/$id/decline';
  static const personalBudgets = '/api/budgets/personal';
  static String personalBudgetById(String id) => '/api/budgets/personal/$id';
  static const groupBudgets = '/api/budgets/group';
  static String groupBudgetById(String id) => '/api/budgets/group/$id';
  static const personalIncome = '/api/income/personal';
  static String personalIncomeById(String id) => '/api/income/personal/$id';
  static const groupIncome = '/api/income/group';
  static String groupIncomeById(String id) => '/api/income/group/$id';
  static const personalSavings = '/api/savings/personal';
  static String personalSavingsById(String id) => '/api/savings/personal/$id';
  static String personalSavingsContribution(String id) =>
      '/api/savings/personal/$id/contributions';
  static const groupSavings = '/api/savings/group';
  static String groupSavingsById(String id) => '/api/savings/group/$id';
  static String groupSavingsContribution(String id) =>
      '/api/savings/group/$id/contributions';
  static const conversations = '/api/conversations';
  static String conversationById(String id) => '/api/conversations/$id';
  static String conversationMessages(String id) =>
      '/api/conversations/$id/messages';
  static String generateConversationTitle(String id) =>
      '/api/conversations/$id/generate-title';
  static const notifications = '/api/notifications';
  static String notificationRead(String id) => '/api/notifications/$id/read';
  static const markAllNotificationsRead = '/api/notifications/mark-all-read';
  static const notificationSettings = '/api/notification-settings';
  static const notificationPreferences = '/api/notification-preferences';
  static String pushToken(String deviceId) => '/api/push-tokens/$deviceId';
  static const defaultGroup = '/api/user/default-group';
  static const userProfile = '/api/user/profile';
  static const userPreferences = '/api/user/preferences';
  static const receiptMedia = '/api/media/receipt';
  static const avatarMedia = '/api/media/avatar';
}
