import type { DatabaseExecutor } from "@veolms/database";

/**
 * What other modules may read about accounts for checks of their own (the
 * affiliate program's self-referral flags): contact details and recent
 * sign-in addresses. Auth owns these tables; this is its read for them.
 */

export interface AccountContacts {
  id: string;
  email: string | null;
  phone: string | null;
}

export async function findAccountContacts(
  executor: DatabaseExecutor,
  userIds: readonly string[],
): Promise<AccountContacts[]> {
  if (userIds.length === 0) return [];
  const rows = await executor
    .selectFrom("users")
    .select(["id", "email", "phone_no"])
    .where("id", "in", [...userIds])
    .execute();
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    phone: row.phone_no,
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
