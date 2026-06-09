export type DataScope = 'personal' | 'group';

export interface ListInput {
  userId: string;
  scope?: DataScope | 'all';
  groupId?: string;
  category?: string;
  month?: number;
  year?: number;
  status?: string;
  approvalStatus?: string;
  limit?: number;
}

export interface IdInput {
  userId: string;
  id: string;
}

export interface GroupInput {
  userId: string;
  groupId: string;
}

export interface UpsertInput {
  userId: string;
  groupId?: string;
  id?: string;
  data: Record<string, unknown>;
}

export interface ContributionInput {
  userId: string;
  id: string;
  amount: number;
}

export interface DuplicateExpenseInput {
  userId: string;
  vendor: string;
  amount: number;
  date: string;
  groupId?: string;
}

export interface MediaUploadInput {
  userId: string;
  kind: 'receipt' | 'avatar';
  fileName: string;
  contentType: string;
  base64: string;
}

export interface MobileDataService {
  listExpenses(input: ListInput): Promise<{ expenses: Record<string, unknown>[] }>;
  getExpense(input: IdInput): Promise<{ expense: Record<string, unknown> }>;
  duplicateExpense(input: DuplicateExpenseInput): Promise<{
    duplicate: Record<string, unknown> | null;
  }>;
  approveExpense(input: IdInput): Promise<{ success: true }>;
  rejectExpense(input: IdInput & { reason?: string }): Promise<{ success: true }>;

  getGroup(input: GroupInput): Promise<{ group: Record<string, unknown> | null }>;
  listGroupActivities(input: GroupInput & { limit?: number }): Promise<{
    activities: Record<string, unknown>[];
  }>;
  getMyMembership(input: GroupInput): Promise<{
    membership: Record<string, unknown> | null;
  }>;
  declineInvitation(input: IdInput): Promise<{ success: true }>;

  listIncome(input: ListInput & { scope: DataScope }): Promise<{
    incomeSources: Record<string, unknown>[];
  }>;
  getIncome(input: IdInput & { scope: DataScope }): Promise<{
    incomeSource: Record<string, unknown>;
  }>;
  createIncome(input: UpsertInput & { scope: DataScope }): Promise<{
    id: string;
    incomeSource: Record<string, unknown>;
  }>;
  updateIncome(input: UpsertInput & { scope: DataScope; id: string }): Promise<{
    incomeSource: Record<string, unknown>;
  }>;
  deleteIncome(input: IdInput & { scope: DataScope }): Promise<{ success: true }>;

  listSavings(input: ListInput & { scope: DataScope }): Promise<{
    savingsGoals: Record<string, unknown>[];
  }>;
  getSavings(input: IdInput & { scope: DataScope }): Promise<{
    savingsGoal: Record<string, unknown>;
  }>;
  createSavings(input: UpsertInput & { scope: DataScope }): Promise<{
    id: string;
    savingsGoal: Record<string, unknown>;
  }>;
  updateSavings(input: UpsertInput & { scope: DataScope; id: string }): Promise<{
    savingsGoal: Record<string, unknown>;
  }>;
  contributeSavings(
    input: ContributionInput & { scope: DataScope },
  ): Promise<{ savingsGoal: Record<string, unknown> }>;
  deleteSavings(input: IdInput & { scope: DataScope }): Promise<{ success: true }>;

  listNotifications(input: { userId: string; limit?: number }): Promise<{
    notifications: Record<string, unknown>[];
  }>;
  markNotificationRead(input: IdInput): Promise<{ success: true }>;
  markAllNotificationsRead(input: { userId: string }): Promise<{ success: true }>;
  deleteNotification(input: IdInput): Promise<{ success: true }>;

  getNotificationSettings(input: { userId: string }): Promise<{
    settings: Record<string, unknown>;
  }>;
  updateNotificationSettings(input: UpsertInput): Promise<{
    settings: Record<string, unknown>;
  }>;
  getNotificationPreferences(input: { userId: string }): Promise<{
    preferences: Record<string, unknown>;
  }>;
  updateNotificationPreferences(input: UpsertInput): Promise<{
    preferences: Record<string, unknown>;
  }>;

  upsertPushToken(input: {
    userId: string;
    deviceId: string;
    token: string;
    platform: string;
  }): Promise<{ success: true }>;
  deletePushToken(input: { userId: string; deviceId: string }): Promise<{
    success: true;
  }>;

  getUserProfile(input: { userId: string }): Promise<{
    profile: Record<string, unknown>;
  }>;
  updateUserProfile(input: UpsertInput): Promise<{
    profile: Record<string, unknown>;
  }>;
  getUserPreferences(input: { userId: string }): Promise<{
    preferences: Record<string, unknown>;
  }>;
  updateUserPreferences(input: UpsertInput): Promise<{
    preferences: Record<string, unknown>;
  }>;

  uploadMedia(input: MediaUploadInput): Promise<{
    url: string;
    path: string;
  }>;
  deleteMedia(input: {
    userId: string;
    path: string;
    kind: 'receipt' | 'avatar';
  }): Promise<{ success: true }>;
}

export function createUnavailableMobileDataService(): MobileDataService {
  const unavailable = async () => {
    throw Object.assign(new Error('Mobile data service is not configured'), {
      statusCode: 503,
    });
  };

  return {
    listExpenses: unavailable,
    getExpense: unavailable,
    duplicateExpense: unavailable,
    approveExpense: unavailable,
    rejectExpense: unavailable,
    getGroup: unavailable,
    listGroupActivities: unavailable,
    getMyMembership: unavailable,
    declineInvitation: unavailable,
    listIncome: unavailable,
    getIncome: unavailable,
    createIncome: unavailable,
    updateIncome: unavailable,
    deleteIncome: unavailable,
    listSavings: unavailable,
    getSavings: unavailable,
    createSavings: unavailable,
    updateSavings: unavailable,
    contributeSavings: unavailable,
    deleteSavings: unavailable,
    listNotifications: unavailable,
    markNotificationRead: unavailable,
    markAllNotificationsRead: unavailable,
    deleteNotification: unavailable,
    getNotificationSettings: unavailable,
    updateNotificationSettings: unavailable,
    getNotificationPreferences: unavailable,
    updateNotificationPreferences: unavailable,
    upsertPushToken: unavailable,
    deletePushToken: unavailable,
    getUserProfile: unavailable,
    updateUserProfile: unavailable,
    getUserPreferences: unavailable,
    updateUserPreferences: unavailable,
    uploadMedia: unavailable,
    deleteMedia: unavailable,
  };
}
