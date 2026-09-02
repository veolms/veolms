import crypto from "node:crypto";

import type {
  Database,
  DatabaseExecutor,
  Json,
  NotificationCategory,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationDeliveryTable,
} from "@veolms/database";
import { sql, type Kysely, type Selectable } from "kysely";

export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

export interface FindNotificationsInput {
  userId: string;
  type?: string;
  category?: NotificationCategory;
  unread?: boolean;
  search?: string;
  cursor?: NotificationCursor;
  limit: number;
}

export async function findNotifications(
  database: DatabaseExecutor,
  input: FindNotificationsInput,
) {
  let query = database
    .selectFrom("notifications")
    .innerJoin("notification_deliveries as in_app", (join) =>
      join
        .onRef("in_app.notification_id", "=", "notifications.id")
        .on("in_app.channel", "=", "in_app")
        .on("in_app.status", "=", "sent"),
    )
    .select([
      "notifications.id",
      "notifications.type",
      "notifications.category",
      "notifications.title",
      "notifications.body",
      "notifications.deep_link",
      "notifications.read_at",
      "notifications.created_at",
    ])
    .where("notifications.recipient_user_id", "=", input.userId)
    .where("notifications.archived_at", "is", null);

  if (input.type) {
    query = query.where("notifications.type", "=", input.type);
  }
  if (input.category) {
    query = query.where("notifications.category", "=", input.category);
  }
  if (input.unread === true) {
    query = query.where("notifications.read_at", "is", null);
  } else if (input.unread === false) {
    query = query.where("notifications.read_at", "is not", null);
  }
  if (input.search) {
    const pattern = `%${input.search}%`;
    query = query.where((expression) =>
      expression.or([
        expression("notifications.title", "ilike", pattern),
        expression("notifications.body", "ilike", pattern),
      ]),
    );
  }
  if (input.cursor) {
    query = query.where(
      sql<boolean>`(
        notifications.created_at < ${input.cursor.createdAt}
        or (
          notifications.created_at = ${input.cursor.createdAt}
          and notifications.id < ${input.cursor.id}::uuid
        )
      )`,
    );
  }

  return await query
    .orderBy("notifications.created_at", "desc")
    .orderBy("notifications.id", "desc")
    .limit(input.limit + 1)
    .execute();
}

export async function getSummary(database: DatabaseExecutor, userId: string) {
  return await database
    .selectFrom("notifications")
    .innerJoin("notification_deliveries as in_app", (join) =>
      join
        .onRef("in_app.notification_id", "=", "notifications.id")
        .on("in_app.channel", "=", "in_app")
        .on("in_app.status", "=", "sent"),
    )
    .select([
      sql<string>`count(*)`.as("total_count"),
      sql<string>`count(*) filter (where notifications.read_at is null)`.as(
        "unread_count",
      ),
      sql<string>`count(*) filter (where notifications.type = 'user.mentioned')`.as(
        "mention_count",
      ),
      sql<string>`count(*) filter (where notifications.category = 'learning')`.as(
        "learning_count",
      ),
      sql<string>`count(*) filter (
        where notifications.type in (
          'system.maintenance',
          'system.announcement',
          'system.important_message'
        )
      )`.as("announcement_count"),
    ])
    .where("notifications.recipient_user_id", "=", userId)
    .where("notifications.archived_at", "is", null)
    .executeTakeFirstOrThrow();
}

export async function markRead(
  database: DatabaseExecutor,
  userId: string,
  notificationId: string,
) {
  return await database
    .updateTable("notifications")
    .set({ read_at: new Date() })
    .where("id", "=", notificationId)
    .where("recipient_user_id", "=", userId)
    .where("archived_at", "is", null)
    .returningAll()
    .executeTakeFirst();
}

export async function markAllRead(
  database: DatabaseExecutor,
  userId: string,
): Promise<number> {
  const result = await database
    .updateTable("notifications")
    .set({ read_at: new Date() })
    .where("recipient_user_id", "=", userId)
    .where("read_at", "is", null)
    .where("archived_at", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}

export async function archive(
  database: DatabaseExecutor,
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const result = await database
    .updateTable("notifications")
    .set({ archived_at: new Date() })
    .where("id", "=", notificationId)
    .where("recipient_user_id", "=", userId)
    .where("archived_at", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function getPreferences(
  database: DatabaseExecutor,
  userId: string,
) {
  return await database
    .selectFrom("notification_preferences")
    .select(["notification_type", "channel", "enabled"])
    .where("user_id", "=", userId)
    .orderBy("notification_type", "asc")
    .orderBy("channel", "asc")
    .execute();
}

export async function getPreference(
  database: DatabaseExecutor,
  userId: string,
  notificationType: string,
  channel: NotificationChannel,
): Promise<boolean | undefined> {
  const row = await database
    .selectFrom("notification_preferences")
    .select("enabled")
    .where("user_id", "=", userId)
    .where("notification_type", "=", notificationType)
    .where("channel", "=", channel)
    .executeTakeFirst();
  return row?.enabled;
}

export async function updatePreference(
  database: DatabaseExecutor,
  input: {
    userId: string;
    notificationType: string;
    channel: NotificationChannel;
    enabled: boolean;
  },
): Promise<void> {
  await database
    .insertInto("notification_preferences")
    .values({
      user_id: input.userId,
      notification_type: input.notificationType,
      channel: input.channel,
      enabled: input.enabled,
    })
    .onConflict((conflict) =>
      conflict
        .columns(["user_id", "notification_type", "channel"])
        .doUpdateSet({ enabled: input.enabled }),
    )
    .execute();
}

export async function createNotification(
  database: DatabaseExecutor,
  input: {
    sourceEventId: string;
    recipientUserId: string;
    type: string;
    category: NotificationCategory;
    title: string;
    body: string;
    deepLink: string | null;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const inserted = await database
    .insertInto("notifications")
    .values({
      id,
      source_event_id: input.sourceEventId,
      recipient_user_id: input.recipientUserId,
      type: input.type,
      category: input.category,
      title: input.title,
      body: input.body,
      deep_link: input.deepLink,
      read_at: null,
      archived_at: null,
    })
    .onConflict((conflict) =>
      conflict
        .columns(["source_event_id", "recipient_user_id", "type"])
        .doNothing(),
    )
    .returning("id")
    .executeTakeFirst();

  if (inserted) return inserted.id;

  const existing = await database
    .selectFrom("notifications")
    .select("id")
    .where("source_event_id", "=", input.sourceEventId)
    .where("recipient_user_id", "=", input.recipientUserId)
    .where("type", "=", input.type)
    .executeTakeFirstOrThrow();
  return existing.id;
}

export async function createDelivery(
  database: DatabaseExecutor,
  input: {
    notificationId: string;
    channel: NotificationChannel;
    status: NotificationDeliveryStatus;
    destination: string | null;
    payload: Json | null;
    sentAt: Date | null;
  },
): Promise<void> {
  await database
    .insertInto("notification_deliveries")
    .values({
      id: crypto.randomUUID(),
      notification_id: input.notificationId,
      channel: input.channel,
      status: input.status,
      destination: input.destination,
      payload: input.payload,
      locked_until: null,
      provider_message_id: null,
      last_error: null,
      sent_at: input.sentAt,
    })
    .onConflict((conflict) =>
      conflict.columns(["notification_id", "channel"]).doNothing(),
    )
    .execute();
}

export type ClaimedDelivery = Selectable<NotificationDeliveryTable>;

export async function claimEmailDeliveries(
  database: Kysely<Database>,
  input: { limit: number; leaseUntil: Date; now: Date },
): Promise<ClaimedDelivery[]> {
  return await database.transaction().execute(async (transaction) => {
    const rows = await transaction
      .selectFrom("notification_deliveries")
      .selectAll()
      .where("channel", "=", "email")
      .where((expression) =>
        expression.or([
          expression.and([
            expression("status", "=", "pending"),
            expression("next_attempt_at", "<=", input.now),
          ]),
          expression.and([
            expression("status", "=", "processing"),
            expression("locked_until", "<", input.now),
          ]),
        ]),
      )
      .orderBy("next_attempt_at", "asc")
      .orderBy("created_at", "asc")
      .forUpdate()
      .skipLocked()
      .limit(input.limit)
      .execute();

    if (rows.length === 0) return [];

    await transaction
      .updateTable("notification_deliveries")
      .set({
        status: "processing",
        locked_until: input.leaseUntil,
        last_error: null,
        updated_at: input.now,
      })
      .where(
        "id",
        "in",
        rows.map((row) => row.id),
      )
      .execute();

    return rows.map((row) => ({
      ...row,
      status: "processing" as const,
      locked_until: input.leaseUntil,
      last_error: null,
      updated_at: input.now,
    }));
  });
}

export async function markDeliverySent(
  database: DatabaseExecutor,
  input: { deliveryId: string; providerMessageId: string | null; now: Date },
): Promise<void> {
  await database
    .updateTable("notification_deliveries")
    .set({
      status: "sent",
      sent_at: input.now,
      provider_message_id: input.providerMessageId,
      locked_until: null,
      last_error: null,
      updated_at: input.now,
    })
    .where("id", "=", input.deliveryId)
    .execute();
}

export async function markDeliveryRetry(
  database: DatabaseExecutor,
  input: {
    deliveryId: string;
    attemptCount: number;
    nextAttemptAt: Date;
    error: string;
    now: Date;
  },
): Promise<void> {
  await database
    .updateTable("notification_deliveries")
    .set({
      status: "pending",
      attempt_count: input.attemptCount,
      next_attempt_at: input.nextAttemptAt,
      locked_until: null,
      last_error: input.error,
      updated_at: input.now,
    })
    .where("id", "=", input.deliveryId)
    .execute();
}

export async function markDeliveryFailed(
  database: DatabaseExecutor,
  input: {
    deliveryId: string;
    attemptCount: number;
    error: string;
    now: Date;
  },
): Promise<void> {
  await database
    .updateTable("notification_deliveries")
    .set({
      status: "failed",
      attempt_count: input.attemptCount,
      locked_until: null,
      last_error: input.error,
      updated_at: input.now,
    })
    .where("id", "=", input.deliveryId)
    .execute();
}
