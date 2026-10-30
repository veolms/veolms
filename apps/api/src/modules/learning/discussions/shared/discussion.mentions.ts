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
import { createDiscussionRepository } from "./discussion.repository.ts";

export { isCourseParticipant } from "./discussion.repository.ts";

const MENTION_PATTERN = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,30})/g;
const MAX_ACTOR_NAME = 255;
const MAX_CONTEXT = 1000;

const discussionRepo = createDiscussionRepository();

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

export async function resolveMentionedUserIds(
  db: DatabaseExecutor,
  usernames: readonly string[],
  courseId: string,
): Promise<string[]> {
  if (usernames.length === 0) return [];

  const users = await discussionRepo.listCourseParticipantIdsByUsername(
    db,
    usernames,
    courseId,
  );
  return users.map((user) => user.id);
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

export async function resolveDeepLink(
  db: DatabaseExecutor,
  courseId: string,
  target:
    | string
    | {
        type: "note";
        noteId: string;
        lessonId: string;
      },
): Promise<string> {
  const course = await discussionRepo.findCourseSlug(db, courseId);
  if (course?.slug) {
    if (typeof target === "string") {
      return `/learn/${encodeURIComponent(course.slug)}?thread=${target}`;
    }
    return `/learn/${encodeURIComponent(course.slug)}?lessonId=${encodeURIComponent(target.lessonId)}&noteId=${encodeURIComponent(target.noteId)}`;
  }
  return "/discussions";
}

export async function resolveActorName(
  db: DatabaseExecutor,
  userId: string,
): Promise<string> {
  const user = await discussionRepo.findUserNames(db, userId);
  const name =
    user?.display_name?.trim() || user?.username?.trim() || "Someone";
  return clamp(name, MAX_ACTOR_NAME);
}

export async function syncMentionsAndNotify(
  db: Transaction<Database>,
  outbox: OutboxService,
  input:
    | {
        sourceType: "thread" | "reply";
        sourceId: string;
        actorUserId: string;
        content: string;
        extraUserIds?: readonly string[];
        courseId: string;
        threadId: string;
        plainText?: string;
      }
    | {
        sourceType: "note";
        sourceId: string;
        actorUserId: string;
        content: string;
        extraUserIds?: readonly string[];
        courseId: string;
        lessonId: string;
        plainText?: string;
      },
): Promise<void> {
  const usernames = extractMentionUsernames(input.content).slice(
    0,
    DISCUSSION_CONSTANTS.MAX_MENTIONS_PER_POST,
  );
  const mentionedIds = new Set<string>();

  if (usernames.length > 0) {
    const resolvedIds = await resolveMentionedUserIds(
      db,
      usernames,
      input.courseId,
    );
    for (const userId of resolvedIds) mentionedIds.add(userId);
  }

  for (const extraId of input.extraUserIds ?? []) {
    if (extraId) mentionedIds.add(extraId);
  }

  mentionedIds.delete(input.actorUserId);

  const existing = await discussionRepo.listMentionsBySource(
    db,
    input.sourceType,
    input.sourceId,
  );

  const keepIds = mentionedIds;
  const removedIds = existing
    .filter((row) => !keepIds.has(row.mentioned_user_id))
    .map((row) => row.id);
  const alreadyMentioned = new Set(
    existing.map((row) => row.mentioned_user_id),
  );
  const addedIds = [...keepIds].filter((id) => !alreadyMentioned.has(id));

  if (removedIds.length > 0) {
    await discussionRepo.deleteMentionsByIds(db, removedIds);
  }

  const actorName = await resolveActorName(db, input.actorUserId);
  const context = mentionContext(
    input.plainText ?? extractPlainText(input.content),
  );
  const deepLink = await resolveDeepLink(
    db,
    input.courseId,
    input.sourceType === "note"
      ? { type: "note", noteId: input.sourceId, lessonId: input.lessonId }
      : input.threadId,
  );
  const occurredAt = new Date();

  // 1. Notify newly @mentioned users
  for (const mentionedUserId of addedIds) {
    const inserted = await discussionRepo.insertMention(db, {
      id: crypto.randomUUID(),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      mentionedUserId,
    });

    if (!inserted) continue;

    await outbox.publish(db, {
      type: "user.mentioned",
      version: 1,
      dedupeKey: `user.mentioned:${input.sourceType}:${input.sourceId}:${mentionedUserId}:${inserted.id}`,
      occurredAt,
      payload: {
        recipientUserId: mentionedUserId,
        actorName,
        context,
        deepLink,
      },
    });
  }

  // 2. If this is a new reply, notify thread author and followers
  if (input.sourceType === "reply") {
    const [thread, followers] = await Promise.all([
      discussionRepo.findThreadTitleAndAuthor(db, input.threadId),
      discussionRepo.listThreadFollowerIds(db, input.threadId),
    ]);

    const subscriberIds = new Set<string>();

    // Add thread author
    if (thread?.user_id && thread.user_id !== input.actorUserId) {
      subscriberIds.add(thread.user_id);
    }

    // Add thread followers
    for (const follower of followers) {
      if (follower.user_id !== input.actorUserId) {
        subscriberIds.add(follower.user_id);
      }
    }

    // Add parent reply author if direct reply
    for (const extraId of input.extraUserIds ?? []) {
      if (extraId && extraId !== input.actorUserId) {
        subscriberIds.add(extraId);
      }
    }

    // Exclude users already notified via @mention
    for (const mentionedId of addedIds) {
      subscriberIds.delete(mentionedId);
    }

    const threadTitle = thread?.title || "Discussion Thread";
    for (const subscriberUserId of subscriberIds) {
      await outbox.publish(db, {
        type: "discussion.reply_created",
        version: 1,
        dedupeKey: `discussion.reply_created:${input.sourceId}:${subscriberUserId}`,
        occurredAt,
        payload: {
          recipientUserId: subscriberUserId,
          actorName,
          threadTitle,
          replySnippet: context,
          deepLink,
        },
      });
    }
  }
}
