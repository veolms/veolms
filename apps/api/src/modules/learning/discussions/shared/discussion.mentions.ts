import crypto from "node:crypto";
import type { Database, DatabaseExecutor } from "@veolms/database";
import type { EngagementTargetType } from "@veolms/contracts";
import type { Kysely, Transaction } from "kysely";
import {
  createOutboxService,
  type OutboxService,
} from "../../../../events/outbox.service.ts";
import { extractPlainText } from "./discussion.utils.ts";
import { DISCUSSION_CONSTANTS } from "./discussion.constants.ts";

const MENTION_PATTERN = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,30})/g;
const MAX_ACTOR_NAME = 255;
const MAX_CONTEXT = 1000;

export function createDiscussionOutbox(): OutboxService {
  return createOutboxService();
}

export function extractMentionUsernames(content: string): string[] {
  const usernames = new Set<string>();
  const text = extractPlainText(content);
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const username = match[2]?.toLowerCase();
    if (username) usernames.add(username);
  }
  return [...usernames];
}

export async function withWriteTransaction<T>(
  db: DatabaseExecutor,
  work: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  if ((db as { isTransaction?: boolean }).isTransaction) {
    return work(db as Transaction<Database>);
  }
  return (db as Kysely<Database>).transaction().execute(work);
}

function clamp(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function mentionContext(plainText: string): string {
  const snippet = plainText.trim().replace(/\s+/g, " ");
  if (!snippet) return "You were mentioned in a discussion.";
  return clamp(snippet, MAX_CONTEXT);
}

async function resolveDeepLink(
  db: DatabaseExecutor,
  courseId: string,
  threadId: string,
): Promise<string> {
  const course = await db
    .selectFrom("courses")
    .select("slug")
    .where("id", "=", courseId)
    .executeTakeFirst();
  if (course?.slug) {
    return `/learn/${encodeURIComponent(course.slug)}?thread=${threadId}`;
  }
  return "/discussions";
}

async function resolveActorName(
  db: DatabaseExecutor,
  userId: string,
): Promise<string> {
  const user = await db
    .selectFrom("users")
    .select(["display_name", "username"])
    .where("id", "=", userId)
    .executeTakeFirst();
  const name =
    user?.display_name?.trim() || user?.username?.trim() || "Someone";
  return clamp(name, MAX_ACTOR_NAME);
}

export async function syncMentionsAndNotify(
  db: Transaction<Database>,
  outbox: OutboxService,
  input: {
    sourceType: EngagementTargetType;
    sourceId: string;
    actorUserId: string;
    content: string;
    extraUserIds?: readonly string[];
    courseId: string;
    threadId: string;
    plainText?: string;
  },
): Promise<void> {
  const usernames = extractMentionUsernames(input.content).slice(
    0,
    DISCUSSION_CONSTANTS.MAX_MENTIONS_PER_POST,
  );
  const mentionedIds = new Set<string>();

  if (usernames.length > 0) {
    const users = await db
      .selectFrom("users")
      .select("id")
      .where("username", "in", usernames)
      .execute();
    for (const user of users) mentionedIds.add(user.id);
  }

  for (const extraId of input.extraUserIds ?? []) {
    if (extraId) mentionedIds.add(extraId);
  }

  mentionedIds.delete(input.actorUserId);
  if (mentionedIds.size === 0) return;

  const actorName = await resolveActorName(db, input.actorUserId);
  const context = mentionContext(
    input.plainText ?? extractPlainText(input.content),
  );
  const deepLink = await resolveDeepLink(db, input.courseId, input.threadId);
  const occurredAt = new Date();

  for (const mentionedUserId of mentionedIds) {
    const inserted = await db
      .insertInto("learning_mentions")
      .values({
        id: crypto.randomUUID(),
        source_type: input.sourceType,
        source_id: input.sourceId,
        mentioned_user_id: mentionedUserId,
      })
      .onConflict((conflict) =>
        conflict
          .columns(["source_type", "source_id", "mentioned_user_id"])
          .doNothing(),
      )
      .returning("id")
      .executeTakeFirst();

    if (!inserted) continue;

    await outbox.publish(db, {
      type: "user.mentioned",
      version: 1,
      dedupeKey: `user.mentioned:${input.sourceType}:${input.sourceId}:${mentionedUserId}`,
      occurredAt,
      payload: {
        recipientUserId: mentionedUserId,
        actorName,
        context,
        deepLink,
      },
    });
  }
}
