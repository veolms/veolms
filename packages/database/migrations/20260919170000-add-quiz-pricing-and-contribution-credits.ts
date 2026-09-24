import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. One quiz price per course. It applies to every quiz attached to the
  //    course, including quizzes attached later. Absence of a row means "free".
  await database.schema
    .createTable("course_quiz_pricing")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("course_id", "uuid", (col) =>
      col.notNull().references("courses.id").onDelete("cascade"),
    )
    .addColumn("pricing_type", "text", (col) => col.notNull().defaultTo("free"))
    .addColumn("price", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("currency", "varchar(3)", (col) =>
      col.notNull().defaultTo("INR"),
    )
    .addColumn("sale_price", "integer")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("course_quiz_pricing_course_unique", ["course_id"])
    .addCheckConstraint(
      "course_quiz_pricing_type_valid",
      sql`pricing_type in ('free', 'paid')`,
    )
    .addCheckConstraint(
      "course_quiz_pricing_amounts_valid",
      sql`(pricing_type = 'free' and price = 0 and sale_price is null)
        or (pricing_type = 'paid' and price > 0 and price <= 1000000
            and (sale_price is null or (sale_price > 0 and sale_price < price)))`,
    )
    .execute();

  // 2. Access grants: one per (user, course). Unlocks every quiz in the course.
  await database.schema
    .createTable("course_quiz_access_grants")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("course_id", "uuid", (col) =>
      col.notNull().references("courses.id").onDelete("cascade"),
    )
    .addColumn("order_id", "uuid", (col) =>
      col.references("orders.id").onDelete("set null"),
    )
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("source", "text", (col) => col.notNull().defaultTo("purchase"))
    .addColumn("valid_from", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("valid_until", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("course_quiz_access_grants_user_course_unique", [
      "user_id",
      "course_id",
    ])
    .addCheckConstraint(
      "course_quiz_access_grants_status_valid",
      sql`status in ('active', 'revoked', 'expired')`,
    )
    .addCheckConstraint(
      "course_quiz_access_grants_source_valid",
      sql`source in ('purchase', 'admin_grant')`,
    )
    .execute();

  await sql`
    create index idx_course_quiz_access_grants_order
      on course_quiz_access_grants (order_id) where order_id is not null
  `.execute(database);

  // 3. order_items gets a reference to the course's quiz pricing row (the
  //    "quiz pass"). The cart is intentionally unchanged.
  await database.schema
    .alterTable("order_items")
    .addColumn("quiz_pricing_id", "uuid", (col) =>
      col.references("course_quiz_pricing.id").onDelete("restrict"),
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
        check (item_type in ('course', 'bundle', 'quiz')),
      add constraint order_items_reference_valid
        check (
          (item_type = 'course' and course_id is not null and bundle_id is null and quiz_pricing_id is null) or
          (item_type = 'bundle' and bundle_id is not null and course_id is null and quiz_pricing_id is null) or
          (item_type = 'quiz' and quiz_pricing_id is not null and course_id is null and bundle_id is null)
        )
  `.execute(database);
  await sql`
    create index idx_order_items_quiz_pricing_id
      on order_items (quiz_pricing_id) where quiz_pricing_id is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_order_items_quiz_pricing_id`.execute(
    database,
  );
  await sql`
    alter table order_items
      drop constraint if exists order_items_type_valid,
      drop constraint if exists order_items_reference_valid
  `.execute(database);
  await sql`delete from order_items where item_type = 'quiz'`.execute(database);
  await sql`
    alter table order_items
      add constraint order_items_type_valid
        check (item_type in ('course', 'bundle')),
      add constraint order_items_reference_valid
        check (
          (item_type = 'course' and course_id is not null and bundle_id is null) or
          (item_type = 'bundle' and bundle_id is not null and course_id is null)
        )
  `.execute(database);
  await sql`alter table order_items drop column if exists quiz_pricing_id`.execute(
    database,
  );

  await database.schema
    .dropTable("course_quiz_access_grants")
    .ifExists()
    .execute();
  await database.schema.dropTable("course_quiz_pricing").ifExists().execute();
}
