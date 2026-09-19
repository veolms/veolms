export interface CreateUserInput {
  email: string | null;
  phoneNo: string | null;
  username: string;
  displayName: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  oauth?: { provider: string; providerUserId: string } | undefined;
  /** The OAuth provider's own profile photo URL, if it exposed one. Gets
   * downloaded into R2; falls back to a DiceBear default on any failure. */
  avatarSourceUrl?: string | undefined;
  /** Identifies the provider-owned avatar namespace when an OAuth photo is
   * successfully downloaded. */
  avatarSource?: "google" | "github" | undefined;
}
