import { sql, type Kysely } from "kysely";

/** What every response allows a username and a display name to be. */
const USERNAME_MAX_LENGTH = 30;
const DISPLAY_NAME_MAX_LENGTH = 100;
/** "_" and eight characters taken from the account's id. */
const USERNAME_TAIL_LENGTH = 9;

/**
 * Accounts created before usernames and display names were bounded on write
 * can hold a username over 30 characters or a display name over 100. The
 * responses that carry them allow no more, so such an account could not sign
 * in or load its own profile, and its profile page (/<username>, at most 30
 * characters) could never be opened.
 *
 * The stored values are shortened so that what the API sends and what a
 * profile address looks up are the same value:
 *
 * - a display name is cut to 100 characters;
 * - a username is cut to 30 characters when no other account has that name,
 *   and otherwise to 21 characters plus "_" and eight characters of the
 *   account's id.
 *
 * Usernames are done one account at a time, oldest first, so two accounts
 * whose names start with the same 30 characters cannot both be given it.
 * Run again, it finds nothing to change. A shortened name cannot be put
 * back, so `down` does nothing.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    update users
    set display_name = left(display_name, ${DISPLAY_NAME_MAX_LENGTH})
    where char_length(display_name) > ${DISPLAY_NAME_MAX_LENGTH}
  `.execute(database);

  const overlong = await sql<{ id: string }>`
    select id
    from users
    where char_length(username) > ${USERNAME_MAX_LENGTH}
    order by created_at, id
  `.execute(database);

  for (const { id } of overlong.rows) {
    await sql`
      update users as account
      set username = case
        when not exists (
          select 1
          from users as other
          where other.username = left(account.username, ${USERNAME_MAX_LENGTH})
        )
          then left(account.username, ${USERNAME_MAX_LENGTH})
        else left(account.username, ${USERNAME_MAX_LENGTH - USERNAME_TAIL_LENGTH})
          || '_' || substr(md5(account.id::text), 1, ${USERNAME_TAIL_LENGTH - 1})
      end
      where account.id = ${id}
    `.execute(database);
  }
}

export async function down(): Promise<void> {
  // Nothing to undo: the longer names are not kept anywhere.
}
