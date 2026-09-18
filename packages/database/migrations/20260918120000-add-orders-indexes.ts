import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create index if not exists idx_orders_user_created_id
      on orders (user_id, created_at desc, id desc)
  `.execute(database);

  await sql`
    create index if not exists idx_orders_created_id
      on orders (created_at desc, id desc)
  `.execute(database);

  await sql`
    create index if not exists idx_order_items_order_course
      on order_items (order_id, course_id)
  `.execute(database);

  await sql`create extension if not exists pg_trgm`.execute(database);
  await sql`
    create index if not exists idx_orders_number_trgm
      on orders using gin (order_number gin_trgm_ops)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_orders_number_trgm`.execute(database);
  await sql`drop index if exists idx_order_items_order_course`.execute(database);
  await sql`drop index if exists idx_orders_created_id`.execute(database);
  await sql`drop index if exists idx_orders_user_created_id`.execute(database);
}
