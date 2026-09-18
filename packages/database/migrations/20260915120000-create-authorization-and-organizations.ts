import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Rename legacy menu permissions table if needed to free up 'permissions' table name
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'permissions' AND column_name = 'menu_id'
      ) THEN
        ALTER TABLE permissions RENAME TO menu_permissions;
      END IF;
    END $$;
  `.execute(db);

  // 2. Extend courses table with thumbnail_url if not present
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'courses' AND column_name = 'thumbnail_url'
      ) THEN
        ALTER TABLE courses ADD COLUMN thumbnail_url TEXT;
      END IF;
    END $$;
  `.execute(db);

  // 3. Create capability permissions table
  await db.schema
    .createTable("permissions")
    .ifNotExists()
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("permission_key", "text", (c) => c.notNull().unique())
    .addColumn("domain", "text", (c) => c.notNull())
    .addColumn("description", "text", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // 4. Extend roles table with is_system
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'roles' AND column_name = 'is_system'
      ) THEN
        ALTER TABLE roles ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT FALSE;
      END IF;
    END $$;
  `.execute(db);

  // 5. Create role_permissions table
  await db.schema
    .createTable("role_permissions")
    .ifNotExists()
    .addColumn("role_id", "uuid", (c) =>
      c.notNull().references("roles.id").onDelete("cascade"),
    )
    .addColumn("permission_id", "uuid", (c) =>
      c.notNull().references("permissions.id").onDelete("cascade"),
    )
    .addColumn("effect", "text", (c) => c.notNull().defaultTo("allow"))
    .addPrimaryKeyConstraint("role_permissions_pkey", [
      "role_id",
      "permission_id",
    ])
    .addCheckConstraint(
      "role_permissions_effect_check",
      sql`effect IN ('allow', 'deny')`,
    )
    .execute();

  // 6. Create scoped role_assignments table (Platform / Course scopes)
  await db.schema
    .createTable("role_assignments")
    .ifNotExists()
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("role_id", "uuid", (c) =>
      c.notNull().references("roles.id").onDelete("cascade"),
    )
    .addColumn("scope_type", "text", (c) => c.notNull())
    .addColumn("course_id", "uuid", (c) =>
      c.references("courses.id").onDelete("cascade"),
    )
    .addColumn("expires_at", "timestamptz")
    .addColumn("created_by", "uuid", (c) =>
      c.references("users.id").onDelete("set null"),
    )
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "role_assignments_scope_type_check",
      sql`scope_type IN ('platform', 'course')`,
    )
    .addCheckConstraint(
      "role_assignments_scope_hierarchy_check",
      sql`(
        (scope_type = 'platform' AND course_id IS NULL) OR
        (scope_type = 'course' AND course_id IS NOT NULL)
      )`,
    )
    .execute();

  await db.schema
    .createIndex("role_assignments_user_idx")
    .ifNotExists()
    .on("role_assignments")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("role_assignments_course_idx")
    .ifNotExists()
    .on("role_assignments")
    .columns(["user_id", "course_id"])
    .execute();

  // 7. Create features table
  await db.schema
    .createTable("features")
    .ifNotExists()
    .addColumn("feature_key", "text", (c) => c.primaryKey())
    .addColumn("description", "text", (c) => c.notNull())
    .addColumn("enabled", "boolean", (c) => c.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("features").ifExists().cascade().execute();
  await db.schema.dropTable("role_assignments").ifExists().cascade().execute();
  await db.schema.dropTable("role_permissions").ifExists().cascade().execute();
  await db.schema.dropTable("permissions").ifExists().cascade().execute();
}
