import type { Executor } from "../shared/repository.types.ts";
import type { ContactChannel } from "./contact-change.rules.ts";

/**
 * The account's email address and mobile number, and whether each is
 * confirmed. Locked with `forUpdate`, inside a transaction: a change is
 * started or completed against values nothing else can alter meanwhile
 * (another change, a verification, a staff edit).
 */
export function findAccountContact(
  database: Executor,
  userId: string,
  options: { forUpdate?: boolean } = {},
) {
  let query = database
    .selectFrom("users")
    .select([
      "id",
      "email",
      "email_verified_at",
      "phone_no",
      "phone_verified_at",
    ])
    .where("id", "=", userId)
    .where("is_deleted", "=", false);
  if (options.forUpdate) query = query.forUpdate();
  return query.executeTakeFirst();
}

/** Whether any account (a deactivated one included) holds this value. */
export function findAccountHolding(
  database: Executor,
  channel: ContactChannel,
  value: string,
) {
  return database
    .selectFrom("users")
    .select("id")
    .where(channel === "email" ? "email" : "phone_no", "=", value)
    .executeTakeFirst();
}

export interface NewContactChange {
  id: string;
  user_id: string;
  channel: ContactChannel;
  current_value: string | null;
  current_proven_at: Date | null;
  proof_required: boolean;
  expires_at: Date;
}

/**
 * Starts a change, closing any the account still had open on the same
 * channel: only the newest one can be completed. Run inside a transaction
 * that holds the account's row (`findAccountContact` with `forUpdate`), so
 * two starts at once cannot both leave a change open.
 */
export async function startContactChange(
  database: Executor,
  change: NewContactChange,
) {
  await database
    .updateTable("contact_changes")
    .set({ expires_at: new Date() })
    .where("user_id", "=", change.user_id)
    .where("channel", "=", change.channel)
    .where("completed_at", "is", null)
    .where("expires_at", ">", new Date())
    .execute();
  return database
    .insertInto("contact_changes")
    .values(change)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** The user's change, locked when `forUpdate` (one completion at a time). */
export function findContactChange(
  database: Executor,
  userId: string,
  changeId: string,
  options: { forUpdate?: boolean } = {},
) {
  let query = database
    .selectFrom("contact_changes")
    .selectAll()
    .where("id", "=", changeId)
    .where("user_id", "=", userId);
  if (options.forUpdate) query = query.forUpdate();
  return query.executeTakeFirst();
}

export function updateContactChange(
  database: Executor,
  changeId: string,
  values: {
    current_proven_at?: Date;
    new_value?: string;
    completed_at?: Date;
  },
) {
  return database
    .updateTable("contact_changes")
    .set(values)
    .where("id", "=", changeId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Puts the new, confirmed value on the account. Like any newly confirmed
 * value it is not public until the learner publishes it again.
 */
export function replaceAccountContact(
  database: Executor,
  userId: string,
  channel: ContactChannel,
  value: string,
  confirmedAt: Date,
) {
  const now = new Date();
  return database
    .updateTable("users")
    .set(
      channel === "email"
        ? {
            email: value,
            email_verified_at: confirmedAt,
            email_public: false,
            updated_at: now,
          }
        : {
            phone_no: value,
            phone_verified_at: confirmedAt,
            mobile_public: false,
            updated_at: now,
          },
    )
    .where("id", "=", userId)
    .where("is_deleted", "=", false)
    .returning(["id", "email", "phone_no"])
    .executeTakeFirst();
}
