export interface AccountService {
  deleteAccount(input: { userId: string }): Promise<{
    success: true;
    message: string;
  }>;
}

export function createUnavailableAccountService(): AccountService {
  return {
    async deleteAccount() {
      throw Object.assign(new Error('Account service is not configured'), {
        statusCode: 503,
      });
    },
  };
}
