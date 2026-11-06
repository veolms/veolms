import type { DatabaseExecutor } from "@veolms/database";

/**
 * What a mention or reply notification says about the comment it is about:
 * who wrote it and what it says, and the lecture and course it is under.
 */
export interface ThreadNotificationContext {
  title: string | null;
  authorId: string;
  plainText: string;
  lessonId: string | null;
  lessonTitle: string | null;
  courseTitle: string;
  courseSlug: string;
}

export async function findThreadNotificationContext(
  db: DatabaseExecutor,
  threadId: string,
): Promise<ThreadNotificationContext | undefined> {
  const row = await db
    .selectFrom("learning_threads as t")
    .innerJoin("courses as c", "c.id", "t.course_id")
    .leftJoin("course_lessons as l", "l.id", "t.lesson_id")
    .select([
      "t.title",
      "t.user_id",
      "t.plain_text",
      "t.lesson_id",
      "l.title as lesson_title",
      "c.title as course_title",
      "c.slug as course_slug",
    ])
    .where("t.id", "=", threadId)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    title: row.title,
    authorId: row.user_id,
    plainText: row.plain_text,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_title,
    courseTitle: row.course_title,
    courseSlug: row.course_slug,
  };
}

/** The reply a new reply answers, when it answers one. */
export async function findReplyAuthorAndText(
  db: DatabaseExecutor,
  replyId: string,
): Promise<{ authorId: string; plainText: string } | undefined> {
  const row = await db
    .selectFrom("learning_replies")
    .select(["user_id", "plain_text"])
    .where("id", "=", replyId)
    .executeTakeFirst();
  return row ? { authorId: row.user_id, plainText: row.plain_text } : undefined;
}

/**
 * The lecture page with the comment brought to the top of its discussion
 * and highlighted (`focus=comment`, as the in-app share link does), and,
 * for a reply, the reply as well (`reply`): the page expands the comment's
 * replies and highlights that one on top of it. The lecture is named by id
 * so the page does not have to look the comment up to find it.
 */
export function commentDeepLink({
  courseSlug,
  threadId,
  lessonId,
  replyId,
}: {
  courseSlug: string;
  threadId: string;
  lessonId: string | null;
  replyId?: string | null;
}): string {
  const search = new URLSearchParams();
  if (lessonId) search.set("lessonId", lessonId);
  search.set("thread", threadId);
  if (replyId) search.set("reply", replyId);
  search.set("focus", "comment");
  return `/learn/${encodeURIComponent(courseSlug)}?${search.toString()}`;
}
