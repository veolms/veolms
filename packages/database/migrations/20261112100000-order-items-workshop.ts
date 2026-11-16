import { sql, type Kysely } from "kysely";

/**
 * A paid workshop registration is bought like a quiz pass: one order item
 * of type `workshop`, pointing at the workshop. Fulfilment then writes the
 * registration (`source = 'order'`, `order_id` set) and a refund cancels it.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .alterTable("order_items")
    .addColumn("workshop_id", "uuid", (col) =>
      col.references("workshops.id").onDelete("restrict"),
    )
    .execute();

  await sql`
    alter table order_items
      drop constraint if exists order_items_type_valid,
      drop constraint if exists order_items_reference_valid
  `.execute(database);
  await sql`
    alter table order_items
      add constraint order_items_type_valid
        check (item_type in ('course', 'bundle', 'quiz', 'workshop')),
      add constraint order_items_reference_valid
        check (
          (item_type = 'course' and course_id is not null and bundle_id is null and quiz_pricing_id is null and workshop_id is null) or
          (item_type = 'bundle' and bundle_id is not null and course_id is null and quiz_pricing_id is null and workshop_id is null) or
          (item_type = 'quiz' and quiz_pricing_id is not null and course_id is null and bundle_id is null and workshop_id is null) or
          (item_type = 'workshop' and workshop_id is not null and course_id is null and bundle_id is null and quiz_pricing_id is null)
        )
  `.execute(database);
  await sql`
    create index idx_order_items_workshop_id
      on order_items (workshop_id) where workshop_id is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_order_items_workshop_id`.execute(database);
  await sql`
    alter table order_items
      drop constraint if exists order_items_type_valid,
      drop constraint if exists order_items_reference_valid
  `.execute(database);
  await sql`delete from order_items where item_type = 'workshop'`.execute(
    database,
  );
  await sql`
    alter table order_items
      add constraint order_items_type_valid
        check (item_type in ('course', 'bundle', 'quiz')),
      add constraint order_items_reference_valid
        check (
          (item_type = 'course' and course_id is not null and bundle_id is null and quiz_pricing_id is null) or
          (item_type = 'bundle' and bundle_id is not null and course_id is null and quiz_pricing_id is null) or
          (item_type = 'quiz' and quiz_pricing_id is not null and course_id is null and bundle_id is null)
        )
  `.execute(database);
  await sql`alter table order_items drop column if exists workshop_id`.execute(
    database,
  );
}
