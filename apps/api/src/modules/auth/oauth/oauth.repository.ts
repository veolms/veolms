import type { Executor } from "../shared/repository.types.ts";

export function findUserByOauthAccount(
  database: Executor,
  provider: string,
  providerUserId: string,
) {
  return database
    .selectFrom("users")
    .innerJoin("oauth_accounts", "oauth_accounts.user_id", "users.id")
    .selectAll("users")
    .where("oauth_accounts.provider", "=", provider)
    .where("oauth_accounts.provider_user_id", "=", providerUserId)
    .where("users.is_deleted", "=", false)
    .executeTakeFirst();
}

export function findUserByOauthAccountIncludingDeleted(
  database: Executor,
  provider: string,
  providerUserId: string,
) {
  return database
    .selectFrom("users")
    .innerJoin("oauth_accounts", "oauth_accounts.user_id", "users.id")
    .selectAll("users")
    .where("oauth_accounts.provider", "=", provider)
    .where("oauth_accounts.provider_user_id", "=", providerUserId)
    .executeTakeFirst();
}

export async function oauthAccountExists(
  database: Executor,
  provider: string,
  providerUserId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("oauth_accounts")
    .select("user_id")
    .where("provider", "=", provider)
    .where("provider_user_id", "=", providerUserId)
    .executeTakeFirst();

  return Boolean(row);
}

export async function insertOauthAccount(
  database: Executor,
  input: {
    id: string;
    userId: string;
    provider: string;
    providerUserId: string;
  },
): Promise<void> {
  await database
    .insertInto("oauth_accounts")
    .values({
      id: input.id,
      user_id: input.userId,
      provider: input.provider,
      provider_user_id: input.providerUserId,
    })
    .execute();
}
