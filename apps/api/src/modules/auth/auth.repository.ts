import type { Database } from "@veolms/database";
import { sql, type Kysely } from "kysely";

import {
  OTP_MAX_ATTEMPTS,
  TOTP_LOCK_DURATION_MS,
  TOTP_MAX_FAILED_ATTEMPTS,
} from "./auth.constants.ts";

/**
 * Data access for the auth module.
 *
 * Functions take their executor first, matching `packages/database/src/courses.ts`,
 * which also lets every one of them run inside a `database.transaction()` block
 * without a second variant. Kept beside the module that owns these tables rather
 * than in the database package, since the shapes are API-internal and none of
 * them cross a package boundary.
 */
type Executor = Kysely<Database>;

export type IdentifierType = "email" | "phone";

// --- Users ------------------------------------------------------------------

export function findUserById(database: Executor, userId: string) {
  return database
    .selectFrom("users")
    .selectAll()
    .where("id", "=", userId)
    .executeTakeFirst();
}

/** Looks a user up by whichever contact channel the flow was started with. */
export function findUserByIdentifier(
  database: Executor,
  identifier: string,
  identifierType: IdentifierType,
) {
  return database
    .selectFrom("users")
    .selectAll()
    .where(identifierType === "email" ? "email" : "phone_no", "=", identifier)
    .executeTakeFirst();
}

export function findUserByEmail(database: Executor, email: string) {
  return database
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email)
    .executeTakeFirst();
}

/**
 * Looks up a user by email, but only if their email has been verified.
 * Used for OAuth auto-linking: we must not link an OAuth identity to an
 * account that never proved ownership of the address.
 */
export function findVerifiedUserByEmail(database: Executor, email: string) {
  return database
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email)
    .where("email_verified_at", "is not", null)
    .executeTakeFirst();
}

export async function usernameExists(
  database: Executor,
  username: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("users")
    .select("id")
    .where("username", "=", username)
    .executeTakeFirst();

  return Boolean(row);
}

export async function countUsers(database: Executor): Promise<number> {
  const row = await database
    .selectFrom("users")
    .select((eb) => eb.fn.count<string>("id").as("count"))
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

export interface InsertUserInput {
  id: string;
  email: string | null;
  phoneNo: string | null;
  username: string;
  displayName: string;
  emailVerifiedAt: Date | null;
  mfaMandatory: boolean;
}

export async function insertUser(
  database: Executor,
  input: InsertUserInput,
): Promise<void> {
  await database
    .insertInto("users")
    .values({
      id: input.id,
      email: input.email,
      phone_no: input.phoneNo,
      username: input.username,
      display_name: input.displayName,
      email_verified_at: input.emailVerifiedAt,
      mfa_mandatory: input.mfaMandatory,
    })
    .execute();
}

// --- Roles ------------------------------------------------------------------

export async function listUserRoleNames(
  database: Executor,
  userId: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("user_roles")
    .innerJoin("roles", "roles.id", "user_roles.role_id")
    .select("roles.name")
    .where("user_roles.user_id", "=", userId)
    .execute();

  return rows.map((row) => row.name);
}

export async function findRoleIdByName(
  database: Executor,
  name: string,
): Promise<string | undefined> {
  const row = await database
    .selectFrom("roles")
    .select("id")
    .where("name", "=", name)
    .executeTakeFirst();

  return row?.id;
}

export async function assignRole(
  database: Executor,
  userId: string,
  roleId: string,
): Promise<void> {
  await database
    .insertInto("user_roles")
    .values({ user_id: userId, role_id: roleId })
    .execute();
}

// --- OAuth accounts ---------------------------------------------------------

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

// --- One-time passcodes -----------------------------------------------------

export function findMatchingActiveOtp(
  database: Executor,
  input: {
    identifier: string;
    identifierType: IdentifierType;
    purpose: string;
    codeHash: string;
    now: Date;
  },
) {
  return database
    .selectFrom("otp_codes")
    .selectAll()
    .where("identifier", "=", input.identifier)
    .where("identifier_type", "=", input.identifierType)
    .where("purpose", "=", input.purpose)
    .where("code_hash", "=", input.codeHash)
    .where("consumed_at", "is", null)
    .where("expires_at", ">", input.now)
    .executeTakeFirst();
}

export function findOutstandingOtp(
  database: Executor,
  input: {
    identifier: string;
    identifierType: IdentifierType;
    purpose: string;
    now: Date;
  },
) {
  return database
    .selectFrom("otp_codes")
    .select(["id", "attempts"])
    .where("identifier", "=", input.identifier)
    .where("identifier_type", "=", input.identifierType)
    .where("purpose", "=", input.purpose)
    .where("consumed_at", "is", null)
    .where("expires_at", ">", input.now)
    .executeTakeFirst();
}

/**
 * Records a wrong guess, burning the code once the attempt ceiling is hit so a
 * single outstanding OTP cannot be brute-forced.
 *
 * The increment happens in SQL rather than as a read-modify-write. Reading
 * `attempts` into JS and writing back an absolute value lets N concurrent
 * guesses all observe the same starting count and collapse into a single
 * increment, which leaves the ceiling effectively unreachable under load.
 */
export async function recordOtpAttempt(
  database: Executor,
  otpId: string,
  now: Date,
): Promise<void> {
  await sql`
    update otp_codes
    set attempts = attempts + 1,
        consumed_at = case
          when attempts + 1 >= ${OTP_MAX_ATTEMPTS} then ${now}
          else consumed_at
        end
    where id = ${otpId}
      and consumed_at is null
  `.execute(database);
}

/**
 * Consumes a code, re-asserting every precondition in the WHERE clause so two
 * concurrent verifications cannot both succeed. Returns whether this call won.
 */
export async function consumeOtp(
  database: Executor,
  otpId: string,
  now: Date,
): Promise<boolean> {
  const result = await database
    .updateTable("otp_codes")
    .set({ consumed_at: now })
    .where("id", "=", otpId)
    .where("consumed_at", "is", null)
    .where("expires_at", ">", now)
    .where("attempts", "<", OTP_MAX_ATTEMPTS)
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}

/**
 * Retires the outstanding code so only the newest one can be redeemed.
 *
 * Scoped to unconsumed rows on purpose. Deleting the whole history for an
 * identifier would also delete the rows `countOtpsSince` counts, which silently
 * disables the daily send cap and leaves the 60-second throttle as the only
 * limit — roughly 1,440 fresh codes per identifier per day.
 */
export async function retireOutstandingOtps(
  database: Executor,
  input: {
    identifier: string;
    identifierType: IdentifierType;
    purpose: string;
    now: Date;
  },
): Promise<void> {
  await database
    .updateTable("otp_codes")
    .set({ consumed_at: input.now })
    .where("identifier", "=", input.identifier)
    .where("identifier_type", "=", input.identifierType)
    .where("purpose", "=", input.purpose)
    .where("consumed_at", "is", null)
    .execute();
}

export async function hasOtpSince(
  database: Executor,
  input: {
    identifier: string;
    identifierType: IdentifierType;
    purpose: string;
    since: Date;
  },
): Promise<boolean> {
  const row = await database
    .selectFrom("otp_codes")
    .select("id")
    .where("identifier", "=", input.identifier)
    .where("identifier_type", "=", input.identifierType)
    .where("purpose", "=", input.purpose)
    .where("created_at", ">", input.since)
    .executeTakeFirst();

  return Boolean(row);
}

export async function countOtpsSince(
  database: Executor,
  input: {
    identifier: string;
    identifierType: IdentifierType;
    purpose: string;
    since: Date;
  },
): Promise<number> {
  const row = await database
    .selectFrom("otp_codes")
    .select((eb) => eb.fn.count<string>("id").as("count"))
    .where("identifier", "=", input.identifier)
    .where("identifier_type", "=", input.identifierType)
    .where("purpose", "=", input.purpose)
    .where("created_at", ">", input.since)
    .executeTakeFirst();

  return Number(row?.count ?? 0);
}

export async function insertOtp(
  database: Executor,
  input: {
    id: string;
    identifier: string;
    identifierType: IdentifierType;
    purpose: string;
    codeHash: string;
    expiresAt: Date;
  },
): Promise<void> {
  await database
    .insertInto("otp_codes")
    .values({
      id: input.id,
      identifier: input.identifier,
      identifier_type: input.identifierType,
      purpose: input.purpose,
      code_hash: input.codeHash,
      attempts: 0,
      expires_at: input.expiresAt,
      consumed_at: null,
    })
    .execute();
}

// --- Sessions ---------------------------------------------------------------

export async function insertSession(
  database: Executor,
  input: {
    id: string;
    userId: string;
    tokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
    mfaVerified: boolean;
    expiresAt: Date;
  },
): Promise<void> {
  await database
    .insertInto("sessions")
    .values({
      id: input.id,
      user_id: input.userId,
      token_hash: input.tokenHash,
      ip_address: input.ipAddress,
      user_agent: input.userAgent,
      mfa_verified: input.mfaVerified,
      expires_at: input.expiresAt,
    })
    .execute();
}

export async function markSessionMfaVerified(
  database: Executor,
  sessionId: string,
): Promise<void> {
  await database
    .updateTable("sessions")
    .set({ mfa_verified: true })
    .where("id", "=", sessionId)
    .execute();
}

export async function deleteSession(
  database: Executor,
  sessionId: string,
): Promise<void> {
  await database.deleteFrom("sessions").where("id", "=", sessionId).execute();
}

/** Scoped by `user_id` so one user can never revoke another user's session. */
export async function deleteUserSession(
  database: Executor,
  userId: string,
  sessionId: string,
): Promise<void> {
  await database
    .deleteFrom("sessions")
    .where("id", "=", sessionId)
    .where("user_id", "=", userId)
    .execute();
}

export async function deleteOtherUserSessions(
  database: Executor,
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await database
    .deleteFrom("sessions")
    .where("user_id", "=", userId)
    .where("id", "!=", keepSessionId)
    .execute();
}

export function listUserSessions(database: Executor, userId: string) {
  return database
    .selectFrom("sessions")
    .select(["id", "ip_address", "user_agent", "created_at", "last_used_at"])
    .where("user_id", "=", userId)
    .orderBy("last_used_at", "desc")
    .execute();
}

// --- TOTP -------------------------------------------------------------------

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

/**
 * Advances the replay watermark, refusing to move it backwards. Returns whether
 * this call won, so a concurrent reuse of the same step is rejected.
 */
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

/**
 * Records a failed MFA attempt and engages the lockout at the ceiling.
 *
 * Incremented in SQL for the same concurrency reason as `recordOtpAttempt`.
 * Note the `else locked_until` branch: writing NULL there (the obvious
 * translation of "not locked yet") means concurrent failures below the ceiling
 * actively clear an existing lock, so the lockout can never hold.
 */
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

// --- MFA backup codes -------------------------------------------------------

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

/** Returns whether this call was the one that redeemed the code. */
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

// --- Passkeys ---------------------------------------------------------------

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

// --- WebAuthn challenges ----------------------------------------------------

export type ChallengeType = "registration" | "authentication";

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

/** Returns whether this call was the one that consumed the challenge. */
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

// --- Academy ----------------------------------------------------------------

export function findAcademy(database: Executor) {
  return database.selectFrom("academy").selectAll().executeTakeFirst();
}

export async function upsertAcademy(
  database: Executor,
  input: {
    id: string;
    name: string;
    logoUrl: string | null;
    customDomain: string | null;
    exists: boolean;
  },
): Promise<void> {
  const values = {
    name: input.name,
    logo_url: input.logoUrl,
    custom_domain: input.customDomain,
    updated_at: new Date(),
  };

  if (input.exists) {
    await database
      .updateTable("academy")
      .set(values)
      .where("id", "=", input.id)
      .execute();
    return;
  }

  await database
    .insertInto("academy")
    .values({ id: input.id, ...values, setup_completed: false })
    .execute();
}

export async function markSetupCompleted(
  database: Executor,
  academyId: string,
): Promise<void> {
  await database
    .updateTable("academy")
    .set({ setup_completed: true, updated_at: new Date() })
    .where("id", "=", academyId)
    .execute();
}
