import { sql } from "kysely";

import {
  TOTP_LOCK_DURATION_MS,
  TOTP_MAX_FAILED_ATTEMPTS,
} from "../shared/auth.constants.ts";
import type { ChallengeType } from "../shared/auth.types.ts";
import type { Executor } from "../shared/repository.types.ts";

export function findTotpCredential(database: Executor, userId: string) {
  return database
    .selectFrom("user_totp_credentials")
    .select([
      "id",
      "secret_encrypted",
      "enabled",
      "last_used_step",
      "failed_attempts",
      "locked_until",
    ])
    .where("user_id", "=", userId)
    .executeTakeFirst();
}

export async function isTotpEnabled(
  database: Executor,
  userId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("user_totp_credentials")
    .select("enabled")
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return Boolean(row?.enabled);
}

export async function replaceTotpCredential(
  database: Executor,
  input: {
    id: string;
    userId: string;
    secretEncrypted: string;
    lastUsedStep: string;
  },
): Promise<void> {
  await database
    .deleteFrom("user_totp_credentials")
    .where("user_id", "=", input.userId)
    .execute();

  await database
    .insertInto("user_totp_credentials")
    .values({
      id: input.id,
      user_id: input.userId,
      secret_encrypted: input.secretEncrypted,
      enabled: true,
      last_used_step: input.lastUsedStep,
    })
    .execute();
}

export async function advanceTotpStep(
  database: Executor,
  userId: string,
  step: bigint,
): Promise<boolean> {
  const result = await database
    .updateTable("user_totp_credentials")
    .set({
      last_used_step: String(step),
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date(),
    })
    .where("user_id", "=", userId)
    .where((eb) =>
      eb.or([
        eb("last_used_step", "is", null),
        eb("last_used_step", "<", String(step)),
      ]),
    )
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}

export async function recordTotpFailure(
  database: Executor,
  credentialId: string,
): Promise<void> {
  const lockedUntil = new Date(Date.now() + TOTP_LOCK_DURATION_MS);

  await sql`
    update user_totp_credentials
    set failed_attempts = failed_attempts + 1,
        locked_until = case
          when failed_attempts + 1 >= ${TOTP_MAX_FAILED_ATTEMPTS} then ${lockedUntil}
          else locked_until
        end,
        updated_at = now()
    where id = ${credentialId}
  `.execute(database);
}

export async function replaceBackupCodes(
  database: Executor,
  userId: string,
  codes: { id: string; user_id: string; code_hash: string }[],
): Promise<void> {
  await database
    .deleteFrom("mfa_backup_codes")
    .where("user_id", "=", userId)
    .execute();

  if (codes.length > 0) {
    await database.insertInto("mfa_backup_codes").values(codes).execute();
  }
}

export function findUnusedBackupCode(
  database: Executor,
  userId: string,
  codeHash: string,
) {
  return database
    .selectFrom("mfa_backup_codes")
    .select("id")
    .where("user_id", "=", userId)
    .where("code_hash", "=", codeHash)
    .where("used_at", "is", null)
    .executeTakeFirst();
}

export async function redeemBackupCode(
  database: Executor,
  codeId: string,
): Promise<boolean> {
  const result = await database
    .updateTable("mfa_backup_codes")
    .set({ used_at: new Date() })
    .where("id", "=", codeId)
    .where("used_at", "is", null)
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}

export function listUserPasskeys(database: Executor, userId: string) {
  return database
    .selectFrom("passkeys")
    .select(["credential_id", "transports"])
    .where("user_id", "=", userId)
    .execute();
}

export async function countUserPasskeys(
  database: Executor,
  userId: string,
): Promise<number> {
  const row = await database
    .selectFrom("passkeys")
    .select((eb) => eb.fn.count<string>("id").as("count"))
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

export function findUserPasskey(
  database: Executor,
  userId: string,
  credentialId: string,
) {
  return database
    .selectFrom("passkeys")
    .selectAll()
    .where("user_id", "=", userId)
    .where("credential_id", "=", credentialId)
    .executeTakeFirst();
}

export async function insertPasskey(
  database: Executor,
  input: {
    id: string;
    userId: string;
    credentialId: string;
    publicKey: string;
    counter: number;
    transports: string | null;
  },
): Promise<void> {
  await database
    .insertInto("passkeys")
    .values({
      id: input.id,
      user_id: input.userId,
      credential_id: input.credentialId,
      public_key: input.publicKey,
      counter: input.counter,
      transports: input.transports,
    })
    .execute();
}

export async function updatePasskeyCounter(
  database: Executor,
  passkeyId: string,
  counter: number,
): Promise<void> {
  await database
    .updateTable("passkeys")
    .set({ counter })
    .where("id", "=", passkeyId)
    .execute();
}

export async function replaceChallenge(
  database: Executor,
  input: {
    id: string;
    userId: string;
    challenge: string;
    type: ChallengeType;
    expiresAt: Date;
  },
): Promise<void> {
  await database
    .deleteFrom("webauthn_challenges")
    .where("user_id", "=", input.userId)
    .where("type", "=", input.type)
    .execute();

  await database
    .insertInto("webauthn_challenges")
    .values({
      id: input.id,
      user_id: input.userId,
      challenge: input.challenge,
      type: input.type,
      expires_at: input.expiresAt,
      consumed_at: null,
    })
    .execute();
}

export function findActiveChallenge(
  database: Executor,
  userId: string,
  type: ChallengeType,
) {
  return database
    .selectFrom("webauthn_challenges")
    .selectAll()
    .where("user_id", "=", userId)
    .where("type", "=", type)
    .where("expires_at", ">", new Date())
    .where("consumed_at", "is", null)
    .executeTakeFirst();
}

export async function consumeChallenge(
  database: Executor,
  challengeId: string,
): Promise<boolean> {
  const result = await database
    .updateTable("webauthn_challenges")
    .set({ consumed_at: new Date() })
    .where("id", "=", challengeId)
    .where("consumed_at", "is", null)
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}
