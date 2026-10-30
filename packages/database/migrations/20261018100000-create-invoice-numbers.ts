import { sql, type Kysely } from "kysely";

/**
 * Invoices get their own running number: "<prefix>/<year>/<number>", e.g.
 * "INV/2026/000042". The number is issued once, when the order is paid, and
 * never changes after that; the prefix comes from the Platform page's
 * Invoice tab at that moment. Numbering starts again at 1 each calendar year
 * (India time), counted in `invoice_number_counters`.
 *
 * Orders paid before this migration are numbered here, in the order they
 * were paid, with the prefix "INV" (or the one already saved, if any).
 * Until now their invoices read "INV-" plus the order number.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table orders add column if not exists invoice_number text
  `.execute(database);
  await sql`
    create unique index if not exists orders_invoice_number_key
      on orders (invoice_number)
  `.execute(database);
  await sql`
    create table if not exists invoice_number_counters (
      year integer primary key,
      last_number integer not null check (last_number > 0)
    )
  `.execute(database);

  await sql`
    with prefix as (
      select coalesce(
        (
          select nullif(btrim(settings -> 'invoice' ->> 'numberPrefix'), '')
          from platform_settings
          where id
        ),
        'INV'
      ) as value
    ),
    numbered as (
      select
        o.id,
        extract(year from coalesce(o.paid_at, o.created_at) at time zone 'Asia/Kolkata')::int as year,
        row_number() over (
          partition by extract(year from coalesce(o.paid_at, o.created_at) at time zone 'Asia/Kolkata')
          order by coalesce(o.paid_at, o.created_at), o.created_at, o.id
        ) as number
      from orders o
      where o.status in ('paid', 'partially_refunded', 'refunded')
        and o.invoice_number is null
    )
    update orders o
    set invoice_number =
      (select value from prefix) || '/' || numbered.year || '/' || lpad(numbered.number::text, 6, '0')
    from numbered
    where o.id = numbered.id
  `.execute(database);

  await sql`
    insert into invoice_number_counters (year, last_number)
    select
      extract(year from coalesce(paid_at, created_at) at time zone 'Asia/Kolkata')::int,
      count(*)::int
    from orders
    where invoice_number is not null
    group by 1
    on conflict (year) do update
      set last_number = greatest(invoice_number_counters.last_number, excluded.last_number)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists invoice_number_counters`.execute(database);
  await sql`drop index if exists orders_invoice_number_key`.execute(database);
  await sql`alter table orders drop column if exists invoice_number`.execute(
    database,
  );
}
