import { sql, type Kysely } from "kysely";

/**
 * A buyer can take back a bank transfer they reported, while staff have not
 * answered it. The request then has the status `withdrawn`, which the
 * status check on `manual_payment_requests` did not allow.
 *
 * The check is replaced in one statement, so no row is ever unchecked.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table manual_payment_requests
      drop constraint if exists manual_payment_requests_status_valid,
      add constraint manual_payment_requests_status_valid
        check (status in ('pending', 'verified', 'rejected', 'withdrawn'))
  `.execute(database);
}

/**
 * Withdrawn requests become rejected: the nearest status the old check
 * allows, and like it one that staff no longer have to answer.
 */
export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    update manual_payment_requests
    set status = 'rejected'
    where status = 'withdrawn'
  `.execute(database);
  await sql`
    alter table manual_payment_requests
      drop constraint if exists manual_payment_requests_status_valid,
      add constraint manual_payment_requests_status_valid
        check (status in ('pending', 'verified', 'rejected'))
  `.execute(database);
}
