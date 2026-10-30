import { sql, type Kysely } from "kysely";

/**
 * Which courses each order item granted, written once when the order is
 * fulfilled and never changed afterwards.
 *
 * Nothing else keeps this. `enrollments` and `access_grants` hold one row
 * per (user, course) and each later purchase overwrites their `order_id`;
 * a bundle item stores only its `bundle_id`, and `course_bundle_items` is
 * the bundle as it is today, not as it was sold. So two paid orders of one
 * buyer could not be compared course by course once a bundle was involved.
 *
 * One row per (order item, course): a course item has one, a bundle item has
 * one for every course it held when it was fulfilled. `order_id` and
 * `user_id` repeat what the item's order says, so "every order of this buyer
 * that granted this course" is one index read.
 *
 * Filled in here for course items of orders that were paid (`paid`,
 * `partially_refunded`, `refunded`): an item of type `course` names its
 * course, so that is known exactly, and `granted_at` is when the order was
 * paid. NOT filled in for bundle items: what a bundle held when it was sold
 * is not recorded anywhere, and today's contents would be a guess. Bundle
 * orders paid before this migration therefore have no rows and are not
 * compared course by course (the same bundle bought twice is still found,
 * from `order_items` alone).
 *
 * Run again, the backfill adds nothing: the unique rule skips what is there.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists order_item_courses (
      id uuid primary key default gen_random_uuid(),
      order_item_id uuid not null references order_items (id) on delete cascade,
      order_id uuid not null references orders (id) on delete cascade,
      user_id uuid not null references users (id) on delete cascade,
      course_id uuid not null references courses (id) on delete restrict,
      granted_at timestamptz not null default current_timestamp,
      constraint order_item_courses_item_course_unique
        unique (order_item_id, course_id)
    )
  `.execute(database);

  // "Every order of this buyer that granted this course."
  await sql`
    create index if not exists idx_order_item_courses_user_course
      on order_item_courses (user_id, course_id)
  `.execute(database);

  // "Everything this order granted."
  await sql`
    create index if not exists idx_order_item_courses_order_id
      on order_item_courses (order_id)
  `.execute(database);

  await sql`
    insert into order_item_courses
      (order_item_id, order_id, user_id, course_id, granted_at)
    select
      oi.id,
      o.id,
      o.user_id,
      oi.course_id,
      coalesce(o.paid_at, o.created_at)
    from order_items oi
    join orders o on o.id = oi.order_id
    where oi.item_type = 'course'
      and oi.course_id is not null
      and o.status in ('paid', 'partially_refunded', 'refunded')
    on conflict (order_item_id, course_id) do nothing
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists order_item_courses`.execute(database);
}
