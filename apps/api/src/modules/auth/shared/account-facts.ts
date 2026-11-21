import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";

/**
 * What other modules may read about accounts for checks of their own (the
 * affiliate program's self-referral flags): contact details and recent
 * sign-in addresses. Auth owns these tables; this is its read for them.
 */

export interface AccountContacts {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
}

export async function findAccountContacts(
  executor: DatabaseExecutor,
  userIds: readonly string[],
): Promise<AccountContacts[]> {
  if (userIds.length === 0) return [];
  const rows = await executor
    .selectFrom("users")
    .select(["id", "email", "phone_no", "display_name"])
    .where("id", "in", [...userIds])
    .execute();
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    phone: row.phone_no,
    displayName: row.display_name,
  }));
}

/** The addresses an account signed in from since a moment. */
export async function listSignInAddressesSince(
  executor: DatabaseExecutor,
  userId: string,
  since: Date,
): Promise<string[]> {
  const rows = await executor
    .selectFrom("sessions")
    .select("ip_address")
    .where("user_id", "=", userId)
    .where((eb) =>
      eb.or([eb("created_at", ">=", since), eb("last_used_at", ">=", since)]),
    )
    .where("ip_address", "is not", null)
    .execute();
  return [...new Set(rows.map((row) => row.ip_address!))];
}

/** The account with this email (lower case), if any; deleted ones excluded. */
export async function findAccountIdByEmail(
  executor: DatabaseExecutor,
  email: string,
): Promise<string | undefined> {
  const row = await executor
    .selectFrom("users")
    .select("id")
    .where(sql<boolean>`lower(email) = ${email.toLowerCase()}`)
    .where("is_deleted", "=", false)
    .executeTakeFirst();
  return row?.id;
}

/** Accounts whose name, username or email contains the text (admin search). */
export async function searchAccountIds(
  executor: DatabaseExecutor,
  text: string,
  limit = 200,
): Promise<string[]> {
  const pattern = `%${text.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`;
  const rows = await executor
    .selectFrom("users")
    .select("id")
    .where((eb) =>
      eb.or([
        eb("display_name", "ilike", pattern),
        eb("username", "ilike", pattern),
        eb("email", "ilike", pattern),
      ]),
    )
    .limit(limit)
    .execute();
  return rows.map((row) => row.id);
}

/** Of these accounts, the ones that were closed (deactivated). */
export async function listClosedAccountIds(
  executor: DatabaseExecutor,
  userIds: readonly string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await executor
    .selectFrom("users")
    .select("id")
    .where("id", "in", [...userIds])
    .where("is_deleted", "=", true)
    .execute();
  return rows.map((row) => row.id);
}
