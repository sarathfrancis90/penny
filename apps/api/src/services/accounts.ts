export interface AccountService {
  deleteAccount(input: { userId: string }): Promise<{
    success: true;
    message: string;
    /** False when the data is gone but the sign-in record could not be removed. */
    signInDeleted?: boolean;
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
