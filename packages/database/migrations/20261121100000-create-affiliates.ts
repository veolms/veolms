import { sql, type Kysely } from "kysely";

/**
 * The affiliate program (Affiliate management system PRD, section 12).
 *
 * Eight tables, no change to an existing one:
 *
 * - `affiliates`: one per person who applied or was invited, with their code
 *   and (encrypted) payout details.
 * - `affiliate_commission_rules`: percent or fixed rates, program-wide, per
 *   product, per affiliate, or both. Never edited: a change archives the
 *   rule and adds a new one.
 * - `affiliate_clicks`, `affiliate_referrals`: visits through a link, and
 *   the last one tied to a signed-in buyer.
 * - `affiliate_order_attributions`: who gets credit for an order, decided
 *   once when the order is made.
 * - `affiliate_commissions`: the ledger. Every commission, reversal and
 *   adjustment is a row; balances are sums of rows. A trigger keeps amounts
 *   from ever changing and refuses deletes.
 * - `affiliate_payouts`, `affiliate_audit_log`.
 *
 * Money is bigint minor units beside a char(3) currency.
 *
 * Adds `affiliate.read`, `affiliate.manage` and `affiliate.payout` for
 * admins as ids 89 to 91: permissions are numbered by their place in the
 * contracts list, after `marketing.manage` (88).
 */
const affiliatePermissions = [
  { key: "affiliate.read", id: "00000000-0000-4000-b000-000000000089" },
  { key: "affiliate.manage", id: "00000000-0000-4000-b000-000000000090" },
  { key: "affiliate.payout", id: "00000000-0000-4000-b000-000000000091" },
] as const;

export async function up(database: Kysely<unknown>): Promise<void> {
  for (const permission of affiliatePermissions) {
    await sql`
      insert into permissions (id, permission_key, domain, description)
      values (
        ${permission.id}::uuid,
        ${permission.key},
        'affiliate',
        ${`Permission to perform ${permission.key}`}
      )
      on conflict do nothing
    `.execute(database);
    // Admin holds every permission.
    await sql`
      insert into role_permissions (role_id, permission_id, effect)
      select roles.id, permissions.id, 'allow'
      from roles
      join permissions on permissions.permission_key = ${permission.key}
      where roles.name = 'admin'
      on conflict (role_id, permission_id) do update set effect = 'allow'
    `.execute(database);
  }

  await sql`
    create table if not exists affiliates (
      id uuid primary key default gen_random_uuid(),
      -- Empty only for an invitation not yet accepted. A deleted account
      -- leaves its affiliate record (and ledger) behind.
      user_id uuid references users (id) on delete set null,
      invited_email text,
      -- Stored in lower case; never changes after approval.
      code varchar(20) not null,
      status varchar(12) not null default 'pending',
      application_note text,
      terms_accepted_at timestamptz,
      coupon_id uuid references coupons (id) on delete set null,
      payout_method varchar(8),
      payout_details_encrypted text,
      payout_details_hint varchar(40),
      pan_encrypted text,
      pan_last4 char(4),
      notify_on_commission boolean not null default true,
      status_reason text,
      decided_by uuid references users (id) on delete set null,
      decided_at timestamptz,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp,
      constraint affiliates_code_key unique (code),
      constraint affiliates_user_id_key unique (user_id),
      constraint affiliates_coupon_id_key unique (coupon_id),
      constraint affiliates_status_valid
        check (status in ('pending', 'approved', 'rejected', 'suspended')),
      constraint affiliates_code_format
        check (code ~ '^[a-z0-9-]{3,20}$'),
      constraint affiliates_payout_method_valid
        check (payout_method is null or payout_method in ('upi', 'bank')),
      constraint affiliates_invited_email_lower
        check (invited_email is null or invited_email = lower(invited_email)),
      constraint affiliates_has_person
        check (user_id is not null or invited_email is not null)
    )
  `.execute(database);
  await sql`
    create index if not exists affiliates_status_created_idx
      on affiliates (status, created_at desc)
  `.execute(database);

  await sql`
    create table if not exists affiliate_commission_rules (
      id uuid primary key default gen_random_uuid(),
      -- Empty: every affiliate.
      affiliate_id uuid references affiliates (id) on delete restrict,
      -- Empty: every product.
      target_type varchar(10),
      target_id uuid,
      rate_type varchar(8) not null,
      -- Percent in basis points (2000 = 20%); fixed in minor units.
      rate_value integer not null,
      currency char(3),
      archived_at timestamptz,
      created_by uuid references users (id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      constraint affiliate_rules_target_valid check (
        (target_type is null and target_id is null)
        or (target_type in ('course', 'bundle', 'workshop', 'quiz')
            and target_id is not null)
      ),
      constraint affiliate_rules_rate_valid check (
        (rate_type = 'percent' and rate_value between 0 and 10000)
        or (rate_type = 'fixed' and rate_value >= 0 and currency is not null)
      )
    )
  `.execute(database);
  // One live rule per (affiliate, product); the row with neither is the
  // program default.
  await sql`
    create unique index if not exists affiliate_rules_live_key
      on affiliate_commission_rules (
        coalesce(affiliate_id, '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(target_type, ''),
        coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid)
      )
      where archived_at is null
  `.execute(database);

  await sql`
    create table if not exists affiliate_clicks (
      -- Also the value in the visitor's cookie.
      id uuid primary key default gen_random_uuid(),
      affiliate_id uuid not null references affiliates (id) on delete cascade,
      user_id uuid references users (id) on delete set null,
      landing_path varchar(500) not null,
      referrer_host varchar(255),
      -- HMAC-SHA256 of the address, never the address itself.
      ip_hash char(64) not null,
      user_agent varchar(255) not null default '',
      created_at timestamptz not null default current_timestamp,
      expires_at timestamptz not null
    )
  `.execute(database);
  await sql`
    create index if not exists affiliate_clicks_affiliate_created_idx
      on affiliate_clicks (affiliate_id, created_at desc)
  `.execute(database);
  await sql`
    create index if not exists affiliate_clicks_created_idx
      on affiliate_clicks (created_at)
  `.execute(database);

  await sql`
    create table if not exists affiliate_referrals (
      -- One row per buyer: the last click wins.
      user_id uuid primary key references users (id) on delete cascade,
      affiliate_id uuid not null references affiliates (id) on delete cascade,
      click_id uuid not null,
      expires_at timestamptz not null,
      updated_at timestamptz not null default current_timestamp
    )
  `.execute(database);

  await sql`
    create table if not exists affiliate_order_attributions (
      order_id uuid primary key references orders (id) on delete cascade,
      affiliate_id uuid not null references affiliates (id) on delete restrict,
      source varchar(8) not null,
      click_id uuid,
      coupon_id uuid,
      created_at timestamptz not null default current_timestamp,
      changed_by uuid references users (id) on delete set null,
      changed_at timestamptz,
      constraint affiliate_attributions_source_valid
        check (source in ('code', 'link', 'account', 'manual'))
    )
  `.execute(database);
  await sql`
    create index if not exists affiliate_attributions_affiliate_created_idx
      on affiliate_order_attributions (affiliate_id, created_at desc)
  `.execute(database);

  await sql`
    create table if not exists affiliate_payouts (
      id uuid primary key default gen_random_uuid(),
      affiliate_id uuid not null references affiliates (id) on delete restrict,
      status varchar(10) not null default 'requested',
      currency char(3) not null,
      gross_amount bigint not null,
      tds_amount bigint not null default 0,
      net_amount bigint not null,
      -- A snapshot of the details at creation: a later change does not
      -- move an open payout.
      payout_method varchar(8) not null,
      payout_details_encrypted text not null,
      payout_details_hint varchar(40),
      requested_by varchar(10) not null,
      reference varchar(100),
      paid_on date,
      reason text,
      note text,
      decided_by uuid references users (id) on delete set null,
      decided_at timestamptz,
      created_at timestamptz not null default current_timestamp,
      constraint affiliate_payouts_status_valid
        check (status in ('requested', 'paid', 'rejected', 'failed')),
      constraint affiliate_payouts_requested_by_valid
        check (requested_by in ('affiliate', 'admin')),
      constraint affiliate_payouts_net
        check (tds_amount >= 0 and net_amount = gross_amount - tds_amount),
      constraint affiliate_payouts_paid_has_reference
        check (status <> 'paid' or (reference is not null and paid_on is not null)),
      constraint affiliate_payouts_decline_has_reason
        check (status not in ('rejected', 'failed') or reason is not null)
    )
  `.execute(database);
  // One open payout per affiliate.
  await sql`
    create unique index if not exists affiliate_payouts_one_open_key
      on affiliate_payouts (affiliate_id) where status = 'requested'
  `.execute(database);
  await sql`
    create index if not exists affiliate_payouts_status_created_idx
      on affiliate_payouts (status, created_at desc)
  `.execute(database);

  await sql`
    create table if not exists affiliate_commissions (
      id uuid primary key default gen_random_uuid(),
      affiliate_id uuid not null references affiliates (id) on delete restrict,
      kind varchar(10) not null,
      status varchar(8) not null default 'pending',
      order_id uuid references orders (id) on delete restrict,
      order_item_id uuid references order_items (id) on delete restrict,
      refund_id uuid references refunds (id) on delete restrict,
      -- The sale a reversal belongs to.
      parent_id uuid references affiliate_commissions (id) on delete restrict,
      currency char(3) not null,
      base_amount bigint not null default 0,
      rule_id uuid references affiliate_commission_rules (id) on delete restrict,
      rate_type varchar(8),
      rate_value integer,
      -- In the order's currency; negative for reversals.
      amount bigint not null,
      -- The academy's currency. Equal to amount when the currencies match;
      -- otherwise filled at approval from the order's settlement values.
      payout_currency char(3) not null,
      payout_amount bigint,
      available_at timestamptz not null,
      approved_at timestamptz,
      flags text[] not null default '{}',
      payout_id uuid references affiliate_payouts (id) on delete restrict,
      paid_at timestamptz,
      note text,
      created_by uuid references users (id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      constraint affiliate_commissions_kind_valid
        check (kind in ('sale', 'reversal', 'adjustment')),
      constraint affiliate_commissions_status_valid
        check (status in ('pending', 'approved', 'rejected')),
      constraint affiliate_commissions_sale_shape check (
        kind <> 'sale'
        or (order_id is not null and order_item_id is not null
            and amount >= 0 and rule_id is not null)
      ),
      constraint affiliate_commissions_reversal_shape check (
        kind <> 'reversal'
        or (parent_id is not null and refund_id is not null and amount <= 0)
      ),
      constraint affiliate_commissions_adjustment_note
        check (kind <> 'adjustment' or note is not null),
      constraint affiliate_commissions_rejection_note
        check (status <> 'rejected' or note is not null),
      constraint affiliate_commissions_paid_has_payout
        check (paid_at is null or payout_id is not null)
    )
  `.execute(database);
  // One live commission per order item. A rejected one (for example after
  // an admin moved the credit to another affiliate) frees the item for the
  // corrected row.
  await sql`
    create unique index if not exists affiliate_commissions_one_sale_key
      on affiliate_commissions (order_item_id)
      where kind = 'sale' and status <> 'rejected'
  `.execute(database);
  // One reversal per refund per commission.
  await sql`
    create unique index if not exists affiliate_commissions_one_reversal_key
      on affiliate_commissions (refund_id, parent_id)
      where kind = 'reversal'
  `.execute(database);
  await sql`
    create index if not exists affiliate_commissions_due_idx
      on affiliate_commissions (available_at)
      where status = 'pending'
  `.execute(database);
  await sql`
    create index if not exists affiliate_commissions_balance_idx
      on affiliate_commissions (affiliate_id, status)
      include (payout_amount, payout_id)
  `.execute(database);
  await sql`
    create index if not exists affiliate_commissions_history_idx
      on affiliate_commissions (affiliate_id, created_at desc)
  `.execute(database);
  await sql`
    create index if not exists affiliate_commissions_payout_idx
      on affiliate_commissions (payout_id)
  `.execute(database);
  await sql`
    create index if not exists affiliate_commissions_order_idx
      on affiliate_commissions (order_id)
  `.execute(database);

  // Append-only: what a commission was worked out from, and its amount,
  // never change after insert; corrections are new rows. Only its state
  // moves (status, approval, payout, flags, note), and its payout amount
  // is filled once. Rows are never deleted.
  await sql`
    create or replace function affiliate_commissions_append_only()
    returns trigger language plpgsql as $$
    begin
      if tg_op = 'DELETE' then
        raise exception 'affiliate commissions are never deleted'
          using errcode = 'check_violation';
      end if;
      if new.id is distinct from old.id
        or new.affiliate_id is distinct from old.affiliate_id
        or new.kind is distinct from old.kind
        or new.order_id is distinct from old.order_id
        or new.order_item_id is distinct from old.order_item_id
        or new.refund_id is distinct from old.refund_id
        or new.parent_id is distinct from old.parent_id
        or new.currency is distinct from old.currency
        or new.base_amount is distinct from old.base_amount
        or new.rule_id is distinct from old.rule_id
        or new.rate_type is distinct from old.rate_type
        or new.rate_value is distinct from old.rate_value
        or new.amount is distinct from old.amount
        or new.payout_currency is distinct from old.payout_currency
        or new.available_at is distinct from old.available_at
        or new.created_by is distinct from old.created_by
        or new.created_at is distinct from old.created_at
        or (old.payout_amount is not null
            and new.payout_amount is distinct from old.payout_amount)
        or (old.paid_at is not null
            and new.paid_at is distinct from old.paid_at)
      then
        raise exception 'affiliate commission amounts never change; write an adjustment instead'
          using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(database);
  await sql`
    drop trigger if exists affiliate_commissions_append_only
      on affiliate_commissions
  `.execute(database);
  await sql`
    create trigger affiliate_commissions_append_only
      before update or delete on affiliate_commissions
      for each row execute function affiliate_commissions_append_only()
  `.execute(database);

  await sql`
    create table if not exists affiliate_audit_log (
      id uuid primary key default gen_random_uuid(),
      actor_user_id uuid references users (id) on delete set null,
      -- For example affiliate.approved, rule.changed, payout.marked_paid,
      -- payout_details.viewed.
      action varchar(60) not null,
      subject_type varchar(30) not null,
      subject_id uuid not null,
      -- Before and after; never PAN, bank or UPI details.
      data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default current_timestamp
    )
  `.execute(database);
  await sql`
    create index if not exists affiliate_audit_subject_idx
      on affiliate_audit_log (subject_type, subject_id, created_at desc)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists affiliate_audit_log`.execute(database);
  await sql`drop table if exists affiliate_commissions`.execute(database);
  await sql`drop function if exists affiliate_commissions_append_only()`.execute(
    database,
  );
  await sql`drop table if exists affiliate_payouts`.execute(database);
  await sql`drop table if exists affiliate_order_attributions`.execute(
    database,
  );
  await sql`drop table if exists affiliate_referrals`.execute(database);
  await sql`drop table if exists affiliate_clicks`.execute(database);
  await sql`drop table if exists affiliate_commission_rules`.execute(database);
  await sql`drop table if exists affiliates`.execute(database);
  for (const permission of affiliatePermissions) {
    await sql`
      delete from permissions where permission_key = ${permission.key}
    `.execute(database);
  }
}
