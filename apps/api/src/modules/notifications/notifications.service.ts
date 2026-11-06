import type {
  Notification,
  NotificationListQuery,
  NotificationListResponse,
  NotificationPreference,
  NotificationReadState,
  NotificationSummary,
  UpdateNotificationPreferences,
} from "@veolms/contracts";
import {
  isKnownNotificationPreferenceType,
  LEGACY_NOTIFICATION_TYPE_ALIASES,
} from "@veolms/contracts";
import type { Database, Json } from "@veolms/database";
import type { Kysely } from "kysely";

import type { ClaimedOutboxEvent } from "../../events/outbox.repository.ts";
import * as outboxRepository from "../../events/outbox.repository.ts";
import { AppError } from "../../lib/errors.ts";
import { encodeNotificationSignal } from "./notification-signal.ts";
import * as notificationRepository from "./notifications.repository.ts";
import { clampText } from "../../lib/text.ts";
import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_TITLE_MAX,
  renderNotificationTemplate,
  type NotificationEmailBrand,
} from "./notifications.templates.ts";

/**
 * The academy's name and logo for the emails (cached by the brand service).
 * Loaded lazily: the brand service reaches into the auth module, which this
 * module must not import at load time. Without it the emails use the
 * configured name.
 */
async function loadEmailBrand(
  database: Kysely<Database>,
): Promise<NotificationEmailBrand | undefined> {
  try {
    const { createAcademyBrandService } =
      await import("../academy/academy-brand.service.ts");
    return await createAcademyBrandService({ database }).getBrand();
  } catch {
    return undefined;
  }
}
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
  markRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationReadState>;
  markUnread(
    userId: string,
    notificationId: string,
  ): Promise<NotificationReadState>;
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
  ): Promise<ProcessedNotificationEvent>;
  /**
   * Tells every API process that these users' notifications changed, so
   * their open notification streams refetch. Call after the change commits.
   */
  signalUsersChanged(userIds: readonly string[]): Promise<void>;
}

export interface ProcessedNotificationEvent {
  created: number;
  skipped: number;
  /** Users who got a notification, to be told over the stream. */
  notifiedUserIds: string[];
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
    // Rows stored before titles were clamped at write time can be too long.
    title: clampText(row.title, NOTIFICATION_TITLE_MAX),
    body: clampText(row.body, NOTIFICATION_BODY_MAX),
    deepLink: row.deep_link,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function presentReadState(row: {
  id: string;
  read_at: Date | null;
}): NotificationReadState {
  return { id: row.id, readAt: row.read_at?.toISOString() ?? null };
}

export function createNotificationService({
  database,
}: {
  database: Kysely<Database>;
}): NotificationService {
  async function signalUsersChanged(userIds: readonly string[]) {
    for (const payload of encodeNotificationSignal(userIds)) {
      await notificationRepository.publishSignal(database, payload);
    }
  }

  /**
   * Tells this user's other open tabs and devices that their notifications
   * changed (read, unread, archived), so their badge follows. Best effort:
   * the change is already saved, and those tabs still poll.
   */
  function signalChanged(userId: string) {
    signalUsersChanged([userId]).catch(() => {});
  }

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
  ): Promise<NotificationReadState> {
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
    signalChanged(userId);
    return presentReadState(row);
  }

  async function markUnread(
    userId: string,
    notificationId: string,
  ): Promise<NotificationReadState> {
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
    signalChanged(userId);
    return presentReadState(row);
  }

  async function markAllRead(userId: string) {
    const updatedCount = await notificationRepository.markAllRead(
      database,
      userId,
    );
    if (updatedCount > 0) signalChanged(userId);
    return { updatedCount };
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
    signalChanged(userId);
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
    // Only real, optional types can be stored. Arbitrary strings used to be
    // accepted, which let the table grow without bound and hid typos like
    // the settings page toggling names the server never sends.
    const unknown = input.preferences.find(
      (preference) =>
        !isKnownNotificationPreferenceType(preference.notificationType),
    );
    if (unknown) {
      throw new AppError(
        400,
        "UNKNOWN_NOTIFICATION_TYPE",
        `"${unknown.notificationType}" is not a notification type that can be turned on or off.`,
      );
    }

    // One statement for the whole set (the request schema guarantees each
    // type and channel appears once), so it is atomic without a transaction.
    await notificationRepository.upsertPreferences(
      database,
      userId,
      input.preferences,
    );
    return await getPreferences(userId);
  }

  async function processClaimedEvent(
    event: ClaimedOutboxEvent,
    intents: NotificationIntent[],
    recipients: NotificationRecipientDirectory,
  ): Promise<ProcessedNotificationEvent> {
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
    const emailBrand = await loadEmailBrand(database);
    let created = 0;
    let skipped = 0;
    const notifiedUserIds = new Set<string>();

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
            // A deactivated account cannot sign in to change its settings,
            // so it gets only what is mandatory (its deactivation notice) —
            // not reminders, replies or course announcements.
            if (recipient.isDeleted && !intent.mandatory) {
              chunkSkipped += 1;
              continue;
            }

            const enabledChannels = [] as Array<"in_app" | "email">;
            for (const channel of intent.channels) {
              let enabled: boolean | undefined = intent.mandatory
                ? true
                : await notificationRepository.getPreference(
                    transaction,
                    intent.recipientUserId,
                    intent.type,
                    channel,
                  );
              // An opt-out saved under the name the settings page used
              // before it shared the server's type list still applies.
              const legacyType = LEGACY_NOTIFICATION_TYPE_ALIASES[intent.type];
              if (enabled === undefined && legacyType) {
                enabled = await notificationRepository.getPreference(
                  transaction,
                  intent.recipientUserId,
                  legacyType,
                  channel,
                );
              }
              enabled ??= true;
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
              emailBrand,
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
                  ...(intent.emailAttachments?.length
                    ? {
                        attachments: intent.emailAttachments.map(
                          (attachment) => ({ ...attachment }),
                        ),
                      }
                    : {}),
                } satisfies Json,
                sentAt: null,
              });
            }
            chunkCreated += 1;
            notifiedUserIds.add(intent.recipientUserId);
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
    return { created, skipped, notifiedUserIds: [...notifiedUserIds] };
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
    signalUsersChanged,
  };
}
