import type {
  Notification,
  NotificationListQuery,
  NotificationListResponse,
  NotificationPreference,
  NotificationSummary,
  UpdateNotificationPreferences,
} from "@veolms/contracts";
import type { Database, Json } from "@veolms/database";
import type { Kysely } from "kysely";

import type { ClaimedOutboxEvent } from "../../events/outbox.repository.ts";
import * as outboxRepository from "../../events/outbox.repository.ts";
import { AppError } from "../../lib/errors.ts";
import * as notificationRepository from "./notifications.repository.ts";
import { renderNotificationTemplate } from "./notifications.templates.ts";
import type {
  NotificationIntent,
  NotificationRecipientDirectory,
} from "./notifications.types.ts";

export interface NotificationService {
  list(
    userId: string,
    query: NotificationListQuery,
  ): Promise<NotificationListResponse>;
  getSummary(userId: string): Promise<NotificationSummary>;
  markRead(userId: string, notificationId: string): Promise<Notification>;
  markUnread(userId: string, notificationId: string): Promise<Notification>;
  markAllRead(userId: string): Promise<{ updatedCount: number }>;
  archive(userId: string, notificationId: string): Promise<{ archived: true }>;
  getPreferences(
    userId: string,
  ): Promise<{ preferences: NotificationPreference[] }>;
  updatePreferences(
    userId: string,
    input: UpdateNotificationPreferences,
  ): Promise<{ preferences: NotificationPreference[] }>;
  processClaimedEvent(
    event: ClaimedOutboxEvent,
    intents: NotificationIntent[],
    recipients: NotificationRecipientDirectory,
  ): Promise<{ created: number; skipped: number }>;
}

interface DecodedCursor {
  createdAt: Date;
  id: string;
}

function encodeCursor(cursor: DecodedCursor): string {
  return Buffer.from(
    JSON.stringify([cursor.createdAt.toISOString(), cursor.id]),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string): DecodedCursor {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 2 ||
      typeof decoded[0] !== "string" ||
      typeof decoded[1] !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        decoded[1],
      )
    ) {
      throw new Error("Malformed cursor");
    }
    const createdAt = new Date(decoded[0]);
    if (Number.isNaN(createdAt.getTime())) throw new Error("Invalid date");
    return { createdAt, id: decoded[1] };
  } catch {
    throw new AppError(
      400,
      "INVALID_NOTIFICATION_CURSOR",
      "The notification cursor is invalid or expired.",
    );
  }
}

function presentNotification(row: {
  id: string;
  type: string;
  category: "transactional" | "social" | "learning" | "system";
  title: string;
  body: string;
  deep_link: string | null;
  read_at: Date | null;
  created_at: Date;
}): Notification {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    title: row.title,
    body: row.body,
    deepLink: row.deep_link,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export function createNotificationService({
  database,
}: {
  database: Kysely<Database>;
}): NotificationService {
  async function list(
    userId: string,
    query: NotificationListQuery,
  ): Promise<NotificationListResponse> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rows = await notificationRepository.findNotifications(database, {
      userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.unread !== undefined ? { unread: query.unread } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(cursor ? { cursor } : {}),
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(presentNotification),
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async function getSummary(userId: string): Promise<NotificationSummary> {
    const row = await notificationRepository.getSummary(database, userId);
    return {
      totalCount: Number(row.total_count),
      unreadCount: Number(row.unread_count),
      mentionCount: Number(row.mention_count),
      learningCount: Number(row.learning_count),
      announcementCount: Number(row.announcement_count),
    };
  }

  async function markRead(
    userId: string,
    notificationId: string,
  ): Promise<Notification> {
    const row = await notificationRepository.markRead(
      database,
      userId,
      notificationId,
    );
    if (!row) {
      throw new AppError(
        404,
        "NOTIFICATION_NOT_FOUND",
        "Notification not found.",
      );
    }
    return presentNotification(row);
  }

  async function markUnread(
    userId: string,
    notificationId: string,
  ): Promise<Notification> {
    const row = await notificationRepository.markUnread(
      database,
      userId,
      notificationId,
    );
    if (!row) {
      throw new AppError(
        404,
        "NOTIFICATION_NOT_FOUND",
        "Notification not found.",
      );
    }
    return presentNotification(row);
  }

  async function markAllRead(userId: string) {
    return {
      updatedCount: await notificationRepository.markAllRead(database, userId),
    };
  }

  async function archive(userId: string, notificationId: string) {
    if (
      !(await notificationRepository.archive(database, userId, notificationId))
    ) {
      throw new AppError(
        404,
        "NOTIFICATION_NOT_FOUND",
        "Notification not found.",
      );
    }
    return { archived: true as const };
  }

  async function getPreferences(userId: string) {
    const rows = await notificationRepository.getPreferences(database, userId);
    return {
      preferences: rows.map((row) => ({
        notificationType: row.notification_type,
        channel: row.channel,
        enabled: row.enabled,
      })),
    };
  }

  async function updatePreferences(
    userId: string,
    input: UpdateNotificationPreferences,
  ) {
    await database.transaction().execute(async (transaction) => {
      for (const preference of input.preferences) {
        await notificationRepository.updatePreference(transaction, {
          userId,
          notificationType: preference.notificationType,
          channel: preference.channel,
          enabled: preference.enabled,
        });
      }
    });
    return await getPreferences(userId);
  }

  async function processClaimedEvent(
    event: ClaimedOutboxEvent,
    intents: NotificationIntent[],
    recipients: NotificationRecipientDirectory,
  ): Promise<{ created: number; skipped: number }> {
    const recipientRecords = new Map<
      string,
      Awaited<ReturnType<typeof recipients.findRecipient>>
    >();
    const recipientIds = [
      ...new Set(intents.map((intent) => intent.recipientUserId)),
    ];
    if (recipients.findRecipients) {
      // One bulk query per 500 recipients instead of one query each — a
      // course-wide announcement fans out to every active enrollee.
      for (let i = 0; i < recipientIds.length; i += 500) {
        const batch = await recipients.findRecipients(
          recipientIds.slice(i, i + 500),
        );
        for (const recipient of batch) {
          recipientRecords.set(recipient.id, recipient);
        }
      }
    } else {
      for (const userId of recipientIds) {
        recipientRecords.set(userId, await recipients.findRecipient(userId));
      }
    }

    // Chunked: a course-wide event used to create its notifications and
    // deliveries for EVERY recipient in one transaction (~4 statements per
    // recipient — tens of thousands of statements for a large course),
    // which could outlive the worker's lease and get re-claimed mid-way.
    // Each chunk commits separately; a crash or lease loss between chunks
    // is safe because notification/delivery inserts are idempotent
    // (ON CONFLICT DO NOTHING on their unique keys), so the retry simply
    // skips what already exists. markProcessed runs once at the end,
    // fenced by the claim lease.
    const CHUNK_SIZE = 200;
    let created = 0;
    let skipped = 0;

    for (let start = 0; start < intents.length; start += CHUNK_SIZE) {
      const chunk = intents.slice(start, start + CHUNK_SIZE);
      const chunkResult = await database
        .transaction()
        .execute(async (transaction) => {
          let chunkCreated = 0;
          let chunkSkipped = 0;

          for (const intent of chunk) {
            const recipient = recipientRecords.get(intent.recipientUserId);
            if (!recipient) {
              chunkSkipped += 1;
              continue;
            }

            const enabledChannels = [] as Array<"in_app" | "email">;
            for (const channel of intent.channels) {
              const enabled = intent.mandatory
                ? true
                : ((await notificationRepository.getPreference(
                    transaction,
                    intent.recipientUserId,
                    intent.type,
                    channel,
                  )) ?? true);
              if (enabled) enabledChannels.push(channel);
            }

            if (enabledChannels.length === 0) {
              chunkSkipped += 1;
              continue;
            }

            const rendered = renderNotificationTemplate(
              intent.templateKey,
              intent.templateData,
              intent.deepLink,
            );
            const notificationId =
              await notificationRepository.createNotification(transaction, {
                sourceEventId: event.id,
                recipientUserId: intent.recipientUserId,
                type: intent.type,
                category: intent.category,
                title: rendered.inApp.title,
                body: rendered.inApp.body,
                deepLink: intent.deepLink,
              });

            if (enabledChannels.includes("in_app")) {
              await notificationRepository.createDelivery(transaction, {
                notificationId,
                channel: "in_app",
                status: "sent",
                destination: null,
                payload: null,
                sentAt: new Date(),
              });
            }
            if (enabledChannels.includes("email")) {
              await notificationRepository.createDelivery(transaction, {
                notificationId,
                channel: "email",
                status: recipient.email ? "pending" : "skipped",
                destination: recipient.email,
                payload: {
                  subject: rendered.email.subject,
                  text: rendered.email.text,
                  html: rendered.email.html,
                } satisfies Json,
                sentAt: null,
              });
            }
            chunkCreated += 1;
          }

          return { created: chunkCreated, skipped: chunkSkipped };
        });

      created += chunkResult.created;
      skipped += chunkResult.skipped;
    }

    // Fenced on the claim lease: if this worker lost the lease mid-way,
    // the new owner's reprocessing decides the event's fate instead.
    await outboxRepository.markProcessed(
      database,
      event.id,
      new Date(),
      // Claimed events always carry the lease the claim assigned.
      event.locked_until!,
    );
    return { created, skipped };
  }

  return {
    list,
    getSummary,
    markRead,
    markUnread,
    markAllRead,
    archive,
    getPreferences,
    updatePreferences,
    processClaimedEvent,
  };
}
