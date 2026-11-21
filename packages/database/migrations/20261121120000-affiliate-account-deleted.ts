import { sql, type Kysely } from "kysely";

/**
 * When an affiliate's account is deleted (PRD section 16): the affiliate
 * becomes suspended and keeps their ledger, so the academy can pay what is
 * owed by hand. Before this, deleting such an account failed: `user_id` is
 * set to null by its foreign key, and `affiliates_has_person` refused a
 * record with neither an account nor an invited address.
 *
 * - `affiliates_has_person` now also allows a suspended record with no
 *   account (one whose account was deleted).
 * - A trigger on that change suspends the affiliate, says why, and switches
 *   off their coupon, all in the statement that deletes the account.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table affiliates
      drop constraint if exists affiliates_has_person,
      add constraint affiliates_has_person check (
        user_id is not null or invited_email is not null or status = 'suspended'
      )
  `.execute(database);

  await sql`
    create or replace function affiliates_account_deleted()
    returns trigger language plpgsql as $$
    begin
      if old.user_id is not null and new.user_id is null
         and new.invited_email is null then
        new.status := 'suspended';
        new.status_reason := 'The affiliate''s account was deleted.';
        new.decided_by := null;
        new.decided_at := current_timestamp;
        new.updated_at := current_timestamp;
        if new.coupon_id is not null then
          update coupons set is_active = false, updated_at = current_timestamp
          where id = new.coupon_id;
        end if;
      end if;
      return new;
    end
    $$
  `.execute(database);
  await sql`
    drop trigger if exists affiliates_account_deleted on affiliates
  `.execute(database);
  await sql`
    create trigger affiliates_account_deleted
      before update of user_id on affiliates
      for each row execute function affiliates_account_deleted()
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop trigger if exists affiliates_account_deleted on affiliates
  `.execute(database);
  await sql`drop function if exists affiliates_account_deleted()`.execute(
    database,
  );
  await sql`
    alter table affiliates
      drop constraint if exists affiliates_has_person,
      add constraint affiliates_has_person check (
        user_id is not null or invited_email is not null
      )
  `.execute(database);
}
