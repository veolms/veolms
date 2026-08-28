import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Course Bundles & Bundle Items
  await database.schema
    .createTable("course_bundles")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("thumbnail_media_id", "uuid", (col) =>
      col.references("media_assets.id").onDelete("set null"),
    )
    .addColumn("status", "text", (col) => col.notNull().defaultTo("draft"))
    .addColumn("price", "integer", (col) => col.notNull())
    .addColumn("currency", "varchar(3)", (col) => col.notNull().defaultTo("INR"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("deleted_at", "timestamptz")
    .addCheckConstraint(
      "course_bundles_status_valid",
      sql`status in ('draft', 'published', 'archived')`,
    )
    .addCheckConstraint("course_bundles_price_non_negative", sql`price >= 0`)
    .execute();

  await database.schema
    .createTable("course_bundle_items")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("bundle_id", "uuid", (col) =>
      col.notNull().references("course_bundles.id").onDelete("cascade"),
    )
    .addColumn("course_id", "uuid", (col) =>
      col.notNull().references("courses.id").onDelete("restrict"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("course_bundle_items_unique", ["bundle_id", "course_id"])
    .execute();

  // 2. Carts & Cart Items
  await database.schema
    .createTable("carts")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().unique().references("users.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await database.schema
    .createTable("cart_items")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("cart_id", "uuid", (col) =>
      col.notNull().references("carts.id").onDelete("cascade"),
    )
    .addColumn("item_type", "text", (col) => col.notNull())
    .addColumn("course_id", "uuid", (col) =>
      col.references("courses.id").onDelete("cascade"),
    )
    .addColumn("bundle_id", "uuid", (col) =>
      col.references("course_bundles.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "cart_items_type_valid",
      sql`item_type in ('course', 'bundle')`,
    )
    .addCheckConstraint(
      "cart_items_reference_valid",
      sql`(item_type = 'course' AND course_id IS NOT NULL AND bundle_id IS NULL) OR (item_type = 'bundle' AND bundle_id IS NOT NULL AND course_id IS NULL)`,
    )
    .execute();

  await sql`
    create unique index cart_items_course_unique
      on cart_items (cart_id, course_id)
      where course_id is not null
  `.execute(database);

  await sql`
    create unique index cart_items_bundle_unique
      on cart_items (cart_id, bundle_id)
      where bundle_id is not null
  `.execute(database);

  // 3. Coupons
  await database.schema
    .createTable("coupons")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("code", "text", (col) => col.notNull().unique())
    .addColumn("description", "text")
    .addColumn("discount_type", "text", (col) => col.notNull())
    .addColumn("discount_value", "integer", (col) => col.notNull())
    .addColumn("max_discount_amount", "integer")
    .addColumn("min_order_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("starts_at", "timestamptz", (col) => col.notNull())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("global_usage_limit", "integer")
    .addColumn("per_user_limit", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("restricted_course_ids", sql`uuid[]`)
    .addColumn("restricted_bundle_ids", sql`uuid[]`)
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "coupons_discount_type_valid",
      sql`discount_type in ('percentage', 'fixed')`,
    )
    .addCheckConstraint("coupons_discount_value_positive", sql`discount_value > 0`)
    .addCheckConstraint(
      "coupons_max_discount_positive",
      sql`max_discount_amount IS NULL OR max_discount_amount > 0`,
    )
    .addCheckConstraint("coupons_min_order_non_negative", sql`min_order_amount >= 0`)
    .addCheckConstraint(
      "coupons_global_limit_positive",
      sql`global_usage_limit IS NULL OR global_usage_limit > 0`,
    )
    .addCheckConstraint("coupons_per_user_limit_positive", sql`per_user_limit > 0`)
    .execute();

  // 4. Orders & Order Items
  await database.schema
    .createTable("orders")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("order_number", "text", (col) => col.notNull().unique())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("restrict"),
    )
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("currency", "varchar(3)", (col) => col.notNull().defaultTo("INR"))
    .addColumn("subtotal_amount", "integer", (col) => col.notNull())
    .addColumn("discount_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("tax_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("total_amount", "integer", (col) => col.notNull())
    .addColumn("coupon_id", "uuid", (col) =>
      col.references("coupons.id").onDelete("set null"),
    )
    .addColumn("idempotency_key", "text", (col) => col.unique())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("paid_at", "timestamptz")
    .addColumn("gstin", "text")
    .addColumn("cgst_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("sgst_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("igst_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "orders_status_valid",
      sql`status in ('pending', 'payment_processing', 'paid', 'payment_failed', 'cancelled', 'expired', 'partially_refunded', 'refunded')`,
    )
    .addCheckConstraint("orders_subtotal_non_negative", sql`subtotal_amount >= 0`)
    .addCheckConstraint("orders_discount_non_negative", sql`discount_amount >= 0`)
    .addCheckConstraint("orders_tax_non_negative", sql`tax_amount >= 0`)
    .addCheckConstraint("orders_total_non_negative", sql`total_amount >= 0`)
    .execute();

  await sql`create index idx_orders_user_id on orders (user_id)`.execute(database);
  await sql`create index idx_orders_user_status on orders (user_id, status)`.execute(database);

  await database.schema
    .createTable("order_items")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("order_id", "uuid", (col) =>
      col.notNull().references("orders.id").onDelete("cascade"),
    )
    .addColumn("item_type", "text", (col) => col.notNull())
    .addColumn("course_id", "uuid", (col) =>
      col.references("courses.id").onDelete("restrict"),
    )
    .addColumn("bundle_id", "uuid", (col) =>
      col.references("course_bundles.id").onDelete("restrict"),
    )
    .addColumn("title_snapshot", "text", (col) => col.notNull())
    .addColumn("unit_price", "integer", (col) => col.notNull())
    .addColumn("discount_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("tax_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("final_amount", "integer", (col) => col.notNull())
    .addColumn("hsn_sac_code", "text", (col) => col.defaultTo("999293"))
    .addColumn("tax_rate_percent", "integer", (col) => col.notNull().defaultTo(18))
    .addColumn("cgst_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("sgst_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("igst_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "order_items_type_valid",
      sql`item_type in ('course', 'bundle')`,
    )
    .addCheckConstraint("order_items_unit_price_non_negative", sql`unit_price >= 0`)
    .addCheckConstraint("order_items_discount_non_negative", sql`discount_amount >= 0`)
    .addCheckConstraint("order_items_tax_non_negative", sql`tax_amount >= 0`)
    .addCheckConstraint("order_items_final_non_negative", sql`final_amount >= 0`)
    .execute();

  await sql`create index idx_order_items_order_id on order_items (order_id)`.execute(database);

  // 5. Coupon Redemptions
  await database.schema
    .createTable("coupon_redemptions")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("coupon_id", "uuid", (col) =>
      col.notNull().references("coupons.id").onDelete("restrict"),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("restrict"),
    )
    .addColumn("order_id", "uuid", (col) =>
      col.notNull().references("orders.id").onDelete("restrict"),
    )
    .addColumn("discount_amount", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint("coupon_redemptions_discount_non_negative", sql`discount_amount >= 0`)
    .addUniqueConstraint("coupon_redemptions_coupon_order_unique", ["coupon_id", "order_id"])
    .execute();

  await sql`create index idx_coupon_redemptions_coupon_user on coupon_redemptions (coupon_id, user_id)`.execute(database);
  await sql`create index idx_coupon_redemptions_order_id on coupon_redemptions (order_id)`.execute(database);

  // 6. Payments & Payment Attempts
  await database.schema
    .createTable("payments")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("order_id", "uuid", (col) =>
      col.notNull().references("orders.id").onDelete("restrict"),
    )
    .addColumn("gateway_provider", "text", (col) => col.notNull())
    .addColumn("gateway_order_id", "text", (col) => col.notNull().unique())
    .addColumn("gateway_payment_id", "text", (col) => col.unique())
    .addColumn("amount", "integer", (col) => col.notNull())
    .addColumn("currency", "varchar(3)", (col) => col.notNull().defaultTo("INR"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("initiated"))
    .addColumn("payment_method", "jsonb")
    .addColumn("error_code", "text")
    .addColumn("error_description", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("gateway_key_id", "text")
    .addCheckConstraint(
      "payments_status_valid",
      sql`status in ('initiated', 'processing', 'captured', 'failed', 'refunded')`,
    )
    .addCheckConstraint("payments_amount_non_negative", sql`amount >= 0`)
    .execute();

  await sql`create index idx_payments_order_id on payments (order_id)`.execute(database);

  await database.schema
    .createTable("payment_attempts")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("payment_id", "uuid", (col) =>
      col.notNull().references("payments.id").onDelete("cascade"),
    )
    .addColumn("gateway_payment_id", "text")
    .addColumn("attempt_number", "integer", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("error_code", "text")
    .addColumn("error_description", "text")
    .addColumn("raw_payload", "jsonb")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "payment_attempts_status_valid",
      sql`status in ('initiated', 'processing', 'captured', 'failed')`,
    )
    .execute();

  await sql`create index idx_payment_attempts_payment_id on payment_attempts (payment_id)`.execute(database);

  // 7. Refunds
  await database.schema
    .createTable("refunds")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("order_id", "uuid", (col) =>
      col.notNull().references("orders.id").onDelete("restrict"),
    )
    .addColumn("order_item_id", "uuid", (col) =>
      col.references("order_items.id").onDelete("set null"),
    )
    .addColumn("payment_id", "uuid", (col) =>
      col.notNull().references("payments.id").onDelete("restrict"),
    )
    .addColumn("gateway_refund_id", "text", (col) => col.unique())
    .addColumn("amount", "integer", (col) => col.notNull())
    .addColumn("currency", "varchar(3)", (col) => col.notNull().defaultTo("INR"))
    .addColumn("reason", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("created_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "refunds_status_valid",
      sql`status in ('pending', 'processed', 'failed')`,
    )
    .addCheckConstraint("refunds_amount_positive", sql`amount > 0`)
    .execute();

  await sql`create index idx_refunds_order_id on refunds (order_id)`.execute(database);
  await sql`create index idx_refunds_payment_id on refunds (payment_id)`.execute(database);

  // 8. Access Grants
  await database.schema
    .createTable("access_grants")
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
    .addColumn("status", "varchar(50)", (col) => col.notNull().defaultTo("active"))
    .addColumn("source", "varchar(50)", (col) => col.notNull().defaultTo("purchase"))
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
    .addUniqueConstraint("access_grants_user_course_unique", ["user_id", "course_id"])
    .execute();

  await sql`create index idx_access_grants_user_course on access_grants (user_id, course_id)`.execute(database);
  await sql`create index idx_access_grants_order_id on access_grants (order_id)`.execute(database);

  // 9. Enrollments
  await database.schema
    .createTable("enrollments")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("restrict"),
    )
    .addColumn("course_id", "uuid", (col) =>
      col.notNull().references("courses.id").onDelete("restrict"),
    )
    .addColumn("order_id", "uuid", (col) =>
      col.references("orders.id").onDelete("set null"),
    )
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("source", "text", (col) => col.notNull().defaultTo("direct_purchase"))
    .addColumn("access_starts_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("access_expires_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("enrollments_user_course_unique", ["user_id", "course_id"])
    .addCheckConstraint(
      "enrollments_status_valid",
      sql`status in ('active', 'suspended', 'revoked', 'expired')`,
    )
    .addCheckConstraint(
      "enrollments_source_valid",
      sql`source in ('direct_purchase', 'bundle_purchase', 'free_grant', 'admin_grant')`,
    )
    .execute();

  await sql`create index idx_enrollments_user_id on enrollments (user_id)`.execute(database);
  await sql`create index idx_enrollments_course_id on enrollments (course_id)`.execute(database);
  await sql`create index idx_enrollments_user_status on enrollments (user_id, status)`.execute(database);

  // 10. Webhook Events / Callback Inbox
  await database.schema
    .createTable("webhook_events")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("event_id", "text", (col) => col.notNull())
    .addColumn("event_type", "text", (col) => col.notNull())
    .addColumn("payload", "jsonb", (col) => col.notNull())
    .addColumn("processed_at", "timestamptz")
    .addColumn("error", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("webhook_events_provider_event_unique", ["provider", "event_id"])
    .execute();

  await sql`create index idx_webhook_events_provider_event on webhook_events (provider, event_id)`.execute(database);

  await database.schema
    .createTable("callback_inbox")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("provider", "varchar(50)", (col) => col.notNull())
    .addColumn("event_id", "varchar(255)", (col) => col.notNull())
    .addColumn("event_type", "varchar(100)", (col) => col.notNull())
    .addColumn("payload", "jsonb", (col) => col.notNull())
    .addColumn("processed_at", "timestamptz")
    .addColumn("error", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("callback_inbox_provider_event_unique", ["provider", "event_id"])
    .execute();

  await sql`create index idx_callback_inbox_provider_event on callback_inbox (provider, event_id)`.execute(database);

  // 11. Outbox Events
  await database.schema
    .createTable("outbox_events")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("event_name", "varchar(100)", (col) => col.notNull())
    .addColumn("aggregate_type", "varchar(50)", (col) => col.notNull())
    .addColumn("aggregate_id", "varchar(255)", (col) => col.notNull())
    .addColumn("payload", "jsonb", (col) => col.notNull())
    .addColumn("processed_at", "timestamptz")
    .addColumn("error", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await sql`create index idx_outbox_events_unprocessed on outbox_events (created_at) where processed_at is null`.execute(database);

  // 12. Creator Payment Configurations (FR-PAY-002)
  await database.schema
    .createTable("creator_payment_configs")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("creator_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("encrypted_key_id", "text", (col) => col.notNull())
    .addColumn("encrypted_key_secret", "text", (col) => col.notNull())
    .addColumn("encrypted_webhook_secret", "text")
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("creator_payment_configs_creator_provider_unique", [
      "creator_id",
      "provider",
    ])
    .execute();

  await sql`create index idx_creator_payment_configs_creator on creator_payment_configs (creator_id)`.execute(
    database,
  );

  // 13. Student In-App Refund Requests (FR-PAY-010)
  await database.schema
    .createTable("refund_requests")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("order_id", "uuid", (col) =>
      col.notNull().references("orders.id").onDelete("cascade"),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("admin_notes", "text")
    .addColumn("resolved_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "refund_requests_status_valid",
      sql`status in ('pending', 'approved', 'rejected', 'cancelled')`,
    )
    .execute();

  await sql`create index idx_refund_requests_order_id on refund_requests (order_id)`.execute(
    database,
  );
  await sql`create index idx_refund_requests_user_id on refund_requests (user_id)`.execute(
    database,
  );
  await sql`create index idx_refund_requests_status on refund_requests (status)`.execute(
    database,
  );

  // 14. Manual Offline Payments (FR-PAY-011)
  await database.schema
    .createTable("manual_payment_requests")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("order_id", "uuid", (col) =>
      col.notNull().references("orders.id").onDelete("cascade"),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("payment_method", "text", (col) => col.notNull())
    .addColumn("transaction_reference", "text", (col) => col.notNull())
    .addColumn("proof_media_id", "uuid", (col) =>
      col.references("media_assets.id").onDelete("set null"),
    )
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("admin_notes", "text")
    .addColumn("verified_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("verified_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "manual_payment_requests_status_valid",
      sql`status in ('pending', 'verified', 'rejected')`,
    )
    .execute();

  await sql`create index idx_manual_payment_requests_order on manual_payment_requests (order_id)`.execute(
    database,
  );
  await sql`create index idx_manual_payment_requests_user on manual_payment_requests (user_id)`.execute(
    database,
  );
  await sql`create index idx_manual_payment_requests_status on manual_payment_requests (status)`.execute(
    database,
  );

  // 15. Credit Notes (FR-PAY-009)
  await database.schema
    .createTable("credit_notes")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("credit_note_number", "text", (col) => col.notNull().unique())
    .addColumn("refund_id", "uuid", (col) =>
      col.notNull().references("refunds.id").onDelete("cascade"),
    )
    .addColumn("order_id", "uuid", (col) =>
      col.notNull().references("orders.id").onDelete("cascade"),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("total_refund_amount", "integer", (col) => col.notNull())
    .addColumn("tax_adjustment_amount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await sql`create index idx_credit_notes_order_id on credit_notes (order_id)`.execute(
    database,
  );
  await sql`create index idx_credit_notes_refund_id on credit_notes (refund_id)`.execute(
    database,
  );
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("credit_notes").ifExists().execute();
  await database.schema.dropTable("manual_payment_requests").ifExists().execute();
  await database.schema.dropTable("refund_requests").ifExists().execute();
  await database.schema.dropTable("creator_payment_configs").ifExists().execute();
  await database.schema.dropTable("outbox_events").ifExists().execute();
  await database.schema.dropTable("callback_inbox").ifExists().execute();
  await database.schema.dropTable("webhook_events").ifExists().execute();
  await database.schema.dropTable("enrollments").ifExists().execute();
  await database.schema.dropTable("access_grants").ifExists().execute();
  await database.schema.dropTable("refunds").ifExists().execute();
  await database.schema.dropTable("payment_attempts").ifExists().execute();
  await database.schema.dropTable("payments").ifExists().execute();
  await database.schema.dropTable("coupon_redemptions").ifExists().execute();
  await database.schema.dropTable("order_items").ifExists().execute();
  await database.schema.dropTable("orders").ifExists().execute();
  await database.schema.dropTable("coupons").ifExists().execute();
  await database.schema.dropTable("cart_items").ifExists().execute();
  await database.schema.dropTable("carts").ifExists().execute();
  await database.schema.dropTable("course_bundle_items").ifExists().execute();
  await database.schema.dropTable("course_bundles").ifExists().execute();
}
