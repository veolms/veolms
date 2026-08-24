import { sql } from "kysely";

import { OTP_MAX_ATTEMPTS } from "../shared/auth.constants.ts";
import type { IdentifierType } from "../shared/auth.types.ts";
import type { Executor } from "../shared/repository.types.ts";

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
