import { sql } from "kysely";
import type { Executor } from "../shared/repository.types.ts";

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

/**
 * Inserts a new One Tap nonce and atomically cleans up all expired nonces.
 * Opportunistic inline housekeeping keeps the table small without a cron job.
 */
export async function insertOauthNonce(
  database: Executor,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await sql`delete from oauth_nonces where expires_at < now()`.execute(
    database,
  );
  await database
    .insertInto("oauth_nonces")
    .values({ token_hash: tokenHash, expires_at: expiresAt, used_at: null })
    .execute();
}

/**
 * Atomically marks a nonce as consumed and returns true when it was valid.
 * Returns false when the nonce is unknown, already used, or expired.
 */
export async function consumeOauthNonce(
  database: Executor,
  tokenHash: string,
  now: Date,
): Promise<boolean> {
  const result = await database
    .updateTable("oauth_nonces")
    .set({ used_at: now })
    .where("token_hash", "=", tokenHash)
    .where("used_at", "is", null)
    .where("expires_at", ">", now)
    .returning("token_hash")
    .executeTakeFirst();
  return Boolean(result);
}
