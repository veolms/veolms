import { sql, type Kysely } from "kysely";

/**
 * Accounts are looked up by email exactly as stored, and every address a
 * person types is lower-cased first. Until provider sign-ins were lower-cased
 * too, an account created through Google or GitHub kept the provider's
 * spelling ("Ada@Example.com"), so its owner could not sign in with a code
 * sent to the address they typed, and was offered a second account instead.
 *
 * This lower-cases the stored address of every such account, except where
 * another account already holds the same address in any other spelling
 * (lower-case or not): `users.email` is unique, and which of the two is the
 * real one is for a person to decide. Those are left exactly as they are;
 * `docs/audit-pre-push-checks.sql` (check 5) counts them.
 *
 * `users.email` is the only place an address is kept as a lookup key.
 * One-time codes are stored under the typed, already lower-case address.
 *
 * Run again, it finds nothing to change. The original spelling is not kept,
 * and is not needed, so `down` does nothing.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    update users as account
    set email = lower(account.email)
    where account.email <> lower(account.email)
      and not exists (
        select 1
        from users as other
        where other.id <> account.id
          and lower(other.email) = lower(account.email)
      )
  `.execute(database);
}

export async function down(): Promise<void> {
  // Nothing to undo: the provider's spelling is not kept anywhere.
}
