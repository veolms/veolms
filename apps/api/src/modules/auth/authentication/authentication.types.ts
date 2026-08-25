export interface CreateUserInput {
  email: string | null;
  phoneNo: string | null;
  username: string;
  displayName: string;
  emailVerified: boolean;
  oauth?: { provider: string; providerUserId: string } | undefined;
}
