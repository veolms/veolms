import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<any>): Promise<void> {
  // 1. Create academy table
  await database.schema
    .createTable("academy")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("logo_url", "text")
    .addColumn("custom_domain", "text")
    .addColumn("setup_completed", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // 2. Create users table
  await database.schema
    .createTable("users")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("email", "text", (column) => column.unique())
    .addColumn("phone_no", "text", (column) => column.unique())
    .addColumn("username", "text", (column) => column.notNull().unique())
    .addColumn("display_name", "text", (column) => column.notNull())
    .addColumn("email_verified_at", "timestamptz")
    .addColumn("mfa_mandatory", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // 3. Create roles table
  await database.schema
    .createTable("roles")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull().unique())
    .addColumn("description", "text")
    .addColumn("last_permission_update", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await database
    .insertInto("roles")
    .values([
      { id: "00000000-0000-4000-8000-000000000001", name: "creator", description: "Platform owner and creator" },
      { id: "00000000-0000-4000-8000-000000000002", name: "student", description: "Enrolled student" },
    ])
    .execute();

  // 4. Create user_roles table
  await database.schema
    .createTable("user_roles")
    .addColumn("user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("cascade"))
    .addColumn("role_id", "uuid", (column) => column.notNull().references("roles.id").onDelete("cascade"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addPrimaryKeyConstraint("user_roles_pk", ["user_id", "role_id"])
    .execute();

  // 5. Create menus table
  await database.schema
    .createTable("menus")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("parent_id", "uuid", (column) => column.references("menus.id").onDelete("cascade"))
    .addColumn("label", "text", (column) => column.notNull())
    .addColumn("route_link", "text", (column) => column.notNull())
    .addColumn("icon", "text")
    .addColumn("expanded", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("check_list", "text")
    .addColumn("is_both", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // 6. Create permissions table
  await database.schema
    .createTable("permissions")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("role_id", "uuid", (column) => column.notNull().references("roles.id").onDelete("cascade"))
    .addColumn("menu_id", "uuid", (column) => column.notNull().references("menus.id").onDelete("cascade"))
    .addColumn("can_create", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("can_read", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("can_update", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("can_delete", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addUniqueConstraint("permissions_role_id_menu_id_unique", ["role_id", "menu_id"])
    .execute();

  // 7. Session, OTP, MFA tables
  await database.schema
    .createTable("sessions")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("cascade"))
    .addColumn("token_hash", "text", (column) => column.notNull())
    .addColumn("ip_address", "text")
    .addColumn("user_agent", "text")
    .addColumn("mfa_verified", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("revoked_at", "timestamptz")
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("last_used_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await database.schema
    .createTable("oauth_accounts")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("cascade"))
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("provider_user_id", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addUniqueConstraint("oauth_accounts_provider_provider_user_id_unique", ["provider", "provider_user_id"])
    .execute();

  await database.schema
    .createTable("otp_codes")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("identifier", "text", (column) => column.notNull())
    .addColumn("identifier_type", "text", (column) => column.notNull())
    .addColumn("purpose", "text", (column) => column.notNull())
    .addColumn("code_hash", "text", (column) => column.notNull())
    .addColumn("attempts", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("consumed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await database.schema
    .createTable("passkeys")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("cascade"))
    .addColumn("credential_id", "text", (column) => column.notNull())
    .addColumn("public_key", "text", (column) => column.notNull())
    .addColumn("counter", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("transports", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await database.schema
    .createTable("user_totp_credentials")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("cascade"))
    .addColumn("secret_encrypted", "text", (column) => column.notNull())
    .addColumn("enabled", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("last_used_step", "text")
    .addColumn("failed_attempts", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("locked_until", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await database.schema
    .createTable("mfa_backup_codes")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("cascade"))
    .addColumn("code_hash", "text", (column) => column.notNull())
    .addColumn("used_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await database.schema
    .createTable("webauthn_challenges")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) => column.references("users.id").onDelete("cascade"))
    .addColumn("challenge", "text", (column) => column.notNull())
    .addColumn("type", "text", (column) => column.notNull())
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("consumed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
}

export async function down(database: Kysely<any>): Promise<void> {
  await database.schema.dropTable("webauthn_challenges").ifExists().cascade().execute();
  await database.schema.dropTable("mfa_backup_codes").ifExists().cascade().execute();
  await database.schema.dropTable("user_totp_credentials").ifExists().cascade().execute();
  await database.schema.dropTable("passkeys").ifExists().cascade().execute();
  await database.schema.dropTable("otp_codes").ifExists().cascade().execute();
  await database.schema.dropTable("oauth_accounts").ifExists().cascade().execute();
  await database.schema.dropTable("sessions").ifExists().cascade().execute();
  await database.schema.dropTable("permissions").ifExists().cascade().execute();
  await database.schema.dropTable("menus").ifExists().cascade().execute();
  await database.schema.dropTable("user_roles").ifExists().cascade().execute();
  await database.schema.dropTable("roles").ifExists().cascade().execute();
  await database.schema.dropTable("users").ifExists().cascade().execute();
  await database.schema.dropTable("academy").ifExists().cascade().execute();
}
