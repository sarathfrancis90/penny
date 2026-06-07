export interface UserPreferenceService {
  getDefaultGroup(input: { userId: string }): Promise<{ defaultGroupId: string | null }>;
  setDefaultGroup(input: {
    userId: string;
    groupId: string | null;
  }): Promise<{ success: true; defaultGroupId: string | null }>;
  clearDefaultGroup(input: {
    userId: string;
  }): Promise<{ success: true; defaultGroupId: null }>;
}

export function createUnavailableUserPreferenceService(): UserPreferenceService {
  const unavailable = async () => {
    throw Object.assign(new Error('User preference service is not configured'), {
      statusCode: 503,
    });
  };

  return {
    getDefaultGroup: unavailable,
    setDefaultGroup: unavailable,
    clearDefaultGroup: unavailable,
  };
}
