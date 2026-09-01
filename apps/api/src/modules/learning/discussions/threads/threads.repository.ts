import type { Database, DatabaseExecutor, LearningThreadTable } from "@veolms/database";
import type {
  DiscussionEntryKind,
  DiscussionVisibility,
  InteractionStatus,
  ListLearningThreadsQuery,
  UpdateLearningThreadRequest,
} from "@veolms/contracts";
import type { ExpressionBuilder, Selectable, SelectQueryBuilder } from "kysely";
import { sql } from "kysely";
import {
  authorRoleSql,
  createdAtIdDescSql,
  type DiscussionListCursor,
  normalizeThreadSort,
} from "../shared/discussion.utils.ts";

export type LearningThreadRow = Selectable<LearningThreadTable>;

// Kysely represents a `"learning_threads as t"` aliased query with the alias
// added as its own entry on the DB generic, not the bare table name.
type ThreadsAliasedDB = Database & { t: LearningThreadTable };

export interface ThreadRowWithAuthor {
  id: string;
  academyId: string;
  courseId: string;
  lessonId: string | null;
  userId: string;
  kind: DiscussionEntryKind;
  title: string | null;
  content: string;
  plainText: string;
  timestampSeconds: number | null;
  visibility: DiscussionVisibility;
  status: InteractionStatus;
  isLocked: boolean;
  acceptedAnswerId: string | null;
  likesCount: number;
  repliesCount: number;
  createdAt: Date;
  updatedAt: Date;
  authorName: string | null;
  authorUsername: string | null;
  authorRole: string | null;
}

export type ThreadFilterOptions = ListLearningThreadsQuery & {
  academyId: string;
  currentUserId?: string;
  accessibleCourseIds?: readonly string[];
  pageCursor?: DiscussionListCursor;
};

export interface ThreadsRepository {
  createThread(
    db: DatabaseExecutor,
    thread: {
      id: string;
      academyId: string;
      courseId: string;
      lessonId?: string | null;
      userId: string;
      kind: DiscussionEntryKind;
      title: string | null;
      content: string;
      plainText: string;
      timestampSeconds: number | null;
      visibility: DiscussionVisibility;
      tags?: string[];
    },
  ): Promise<void>;

  findThreadById(
    db: DatabaseExecutor,
    threadId: string,
  ): Promise<ThreadRowWithAuthor | null>;

  listThreads(
    db: DatabaseExecutor,
    options: ThreadFilterOptions,
  ): Promise<ThreadRowWithAuthor[]>;

  countThreads(
    db: DatabaseExecutor,
    options: ThreadFilterOptions,
  ): Promise<number>;

  updateThread(
    db: DatabaseExecutor,
    threadId: string,
    updates: UpdateLearningThreadRequest & { plainText?: string },
  ): Promise<void>;

  deleteThread(db: DatabaseExecutor, threadId: string): Promise<void>;

  incrementRepliesCount(
    db: DatabaseExecutor,
    threadId: string,
    delta: number,
  ): Promise<void>;

  incrementLikesCount(
    db: DatabaseExecutor,
    threadId: string,
    delta: number,
  ): Promise<void>;

  setAcceptedAnswer(
    db: DatabaseExecutor,
    threadId: string,
    replyId: string | null,
  ): Promise<void>;

  setLocked(
    db: DatabaseExecutor,
    threadId: string,
    isLocked: boolean,
  ): Promise<void>;

  setStatus(
    db: DatabaseExecutor,
    threadId: string,
    status: InteractionStatus,
  ): Promise<void>;
}

function applyThreadFilters<O>(
  query: SelectQueryBuilder<ThreadsAliasedDB, "t", O>,
  options: ThreadFilterOptions,
): SelectQueryBuilder<ThreadsAliasedDB, "t", O> {
  let q = query
    .where("t.status", "=", "active")
    .where("t.academy_id", "=", options.academyId);

  if (options.courseId) {
    q = q.where("t.course_id", "=", options.courseId);
  } else if (
    options.accessibleCourseIds &&
    options.accessibleCourseIds.length > 0
  ) {
    q = q.where("t.course_id", "in", [...options.accessibleCourseIds]);
  }

  if (options.lessonId) {
    q = q.where("t.lesson_id", "=", options.lessonId);
  }

  if (options.kind && options.kind !== "all") {
    const normalizedKind = options.kind === "qna" ? "question" : options.kind;
    q = q.where("t.kind", "=", normalizedKind);
  }

  if (options.mine || options.sort === "me") {
    if (options.currentUserId) {
      q = q.where("t.user_id", "=", options.currentUserId);
    } else {
      q = q.where(sql<boolean>`1 = 0`);
    }
  } else if (options.currentUserId) {
    const currentUserId = options.currentUserId;
    if (options.visibility === "private") {
      q = q
        .where("t.visibility", "=", "private")
        .where("t.user_id", "=", currentUserId);
    } else if (options.visibility === "unlisted") {
      q = q
        .where("t.visibility", "=", "unlisted")
        .where("t.user_id", "=", currentUserId);
    } else if (options.visibility === "public") {
      q = q.where("t.visibility", "=", "public");
    } else {
      q = q.where((eb: ExpressionBuilder<ThreadsAliasedDB, "t">) =>
        eb.or([
          eb("t.visibility", "=", "public"),
          eb.and([
            eb("t.visibility", "in", ["private", "unlisted"]),
            eb("t.user_id", "=", currentUserId),
          ]),
        ]),
      );
    }
  } else {
    q = q.where("t.visibility", "=", "public");
  }

  if (options.search) {
    const searchPattern = `%${options.search.toLowerCase()}%`;
    q = q.where((eb: ExpressionBuilder<ThreadsAliasedDB, "t">) =>
      eb.or([
        eb(sql`lower(t.title)`, "like", searchPattern),
        eb(sql`lower(t.plain_text)`, "like", searchPattern),
      ]),
    );
  }

  if (options.status === "answered") {
    q = q.where("t.replies_count", ">", 0);
  } else if (options.status === "solved") {
    q = q.where("t.accepted_answer_id", "is not", null);
  } else if (options.status === "open") {
    q = q
      .where("t.replies_count", "=", 0)
      .where("t.accepted_answer_id", "is", null);
  } else if (options.status === "mentioned") {
    if (!options.currentUserId) {
      q = q.where(sql<boolean>`1 = 0`);
    } else {
      const currentUserId = options.currentUserId;
      q = q.where((eb: ExpressionBuilder<ThreadsAliasedDB, "t">) =>
        eb.or([
          eb.exists(
            eb
              .selectFrom("learning_mentions as m")
              .select(sql`1`.as("one"))
              .whereRef("m.source_id", "=", "t.id")
              .where("m.source_type", "=", "thread")
              .where("m.mentioned_user_id", "=", currentUserId),
          ),
          eb.exists(
            eb
              .selectFrom("learning_mentions as m")
              .innerJoin("learning_replies as lr", "lr.id", "m.source_id")
              .select(sql`1`.as("one"))
              .whereRef("lr.thread_id", "=", "t.id")
              .where("m.source_type", "=", "reply")
              .where("m.mentioned_user_id", "=", currentUserId),
          ),
        ]),
      );
    }
  }

  return q;
}

function applyThreadCursor<O>(
  query: SelectQueryBuilder<ThreadsAliasedDB, "t", O>,
  options: ThreadFilterOptions,
): SelectQueryBuilder<ThreadsAliasedDB, "t", O> {
  const cursor = options.pageCursor;
  if (!cursor) return query;
  const sort = normalizeThreadSort(options.sort);
  if (sort === "activity" && cursor.updatedAt) {
    return query.where(
      sql<boolean>`(
        t.updated_at < ${cursor.updatedAt}
        or (t.updated_at = ${cursor.updatedAt} and t.id < ${cursor.id}::uuid)
      )`,
    );
  }
  if (sort === "replies" && cursor.repliesCount !== undefined) {
    return query.where(
      sql<boolean>`(
        t.replies_count < ${cursor.repliesCount}
        or (t.replies_count = ${cursor.repliesCount} and t.created_at < ${cursor.createdAt})
        or (
          t.replies_count = ${cursor.repliesCount}
          and t.created_at = ${cursor.createdAt}
          and t.id < ${cursor.id}::uuid
        )
      )`,
    );
  }
  if (sort === "popular" && cursor.engagement !== undefined) {
    return query.where(
      sql<boolean>`(
        (t.likes_count + t.replies_count) < ${cursor.engagement}
        or (
          (t.likes_count + t.replies_count) = ${cursor.engagement}
          and t.created_at < ${cursor.createdAt}
        )
        or (
          (t.likes_count + t.replies_count) = ${cursor.engagement}
          and t.created_at = ${cursor.createdAt}
          and t.id < ${cursor.id}::uuid
        )
      )`,
    );
  }
  return query.where(createdAtIdDescSql("t", cursor));
}

export function createThreadsRepository(): ThreadsRepository {
  return {
    async createThread(db, thread) {
      await db
        .insertInto("learning_threads")
        .values({
          id: thread.id,
          academy_id: thread.academyId,
          course_id: thread.courseId,
          lesson_id: thread.lessonId || null,
          user_id: thread.userId,
          kind: thread.kind === "qna" ? "question" : thread.kind,
          title: thread.title,
          content: thread.content,
          plain_text: thread.plainText,
          timestamp_seconds: thread.timestampSeconds,
          visibility: thread.visibility,
          status: "active",
          is_locked: false,
          likes_count: 0,
          replies_count: 0,
        })
        .execute();
    },

    async findThreadById(db, threadId) {
      const row = await db
        .selectFrom("learning_threads as t")
        .innerJoin("users as u", "u.id", "t.user_id")
        .select([
          "t.id as id",
          "t.academy_id as academyId",
          "t.course_id as courseId",
          "t.lesson_id as lessonId",
          "t.user_id as userId",
          "t.kind as kind",
          "t.title as title",
          "t.content as content",
          "t.plain_text as plainText",
          "t.timestamp_seconds as timestampSeconds",
          "t.visibility as visibility",
          "t.status as status",
          "t.is_locked as isLocked",
          "t.accepted_answer_id as acceptedAnswerId",
          "t.likes_count as likesCount",
          "t.replies_count as repliesCount",
          "t.created_at as createdAt",
          "t.updated_at as updatedAt",
          "u.display_name as authorName",
          "u.username as authorUsername",
          authorRoleSql("t.user_id"),
        ])
        .where("t.id", "=", threadId)
        .executeTakeFirst();

      return (row as ThreadRowWithAuthor | undefined) ?? null;
    },

    async listThreads(db, options) {
      let filtered = db.selectFrom("learning_threads as t");
      filtered = applyThreadFilters(filtered, options);
      filtered = applyThreadCursor(filtered, options);

      let query = filtered
        .innerJoin("users as u", "u.id", "t.user_id")
        .select([
          "t.id as id",
          "t.academy_id as academyId",
          "t.course_id as courseId",
          "t.lesson_id as lessonId",
          "t.user_id as userId",
          "t.kind as kind",
          "t.title as title",
          "t.content as content",
          "t.plain_text as plainText",
          "t.timestamp_seconds as timestampSeconds",
          "t.visibility as visibility",
          "t.status as status",
          "t.is_locked as isLocked",
          "t.accepted_answer_id as acceptedAnswerId",
          "t.likes_count as likesCount",
          "t.replies_count as repliesCount",
          "t.created_at as createdAt",
          "t.updated_at as updatedAt",
          "u.display_name as authorName",
          "u.username as authorUsername",
          authorRoleSql("t.user_id"),
        ]);

      if (options.sort === "highest_engagement" || options.sort === "popular") {
        query = query
          .orderBy(
            sql`(${sql.ref("t.likes_count")} + ${sql.ref("t.replies_count")})`,
            "desc",
          )
          .orderBy("t.created_at", "desc")
          .orderBy("t.id", "desc");
      } else if (options.sort === "replies") {
        query = query
          .orderBy("t.replies_count", "desc")
          .orderBy("t.created_at", "desc")
          .orderBy("t.id", "desc");
      } else if (options.sort === "activity") {
        query = query.orderBy("t.updated_at", "desc").orderBy("t.id", "desc");
      } else {
        query = query.orderBy("t.created_at", "desc").orderBy("t.id", "desc");
      }

      const rows = await query.limit(options.limit + 1).execute();
      return rows as ThreadRowWithAuthor[];
    },

    async countThreads(db, options) {
      let query = db.selectFrom("learning_threads as t");
      query = applyThreadFilters(query, options);
      const row = await query
        .select(sql<number>`count(*)::int`.as("count"))
        .executeTakeFirst();
      return Number(row?.count ?? 0);
    },

    async updateThread(db, threadId, updates) {
      const updateData: {
        updated_at: Date;
        title?: string | null;
        content?: string;
        plain_text?: string;
        timestamp_seconds?: number | null;
        visibility?: DiscussionVisibility;
      } = {
        updated_at: new Date(),
      };
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.plainText !== undefined)
        updateData.plain_text = updates.plainText;
      if (updates.timestampSeconds !== undefined)
        updateData.timestamp_seconds = updates.timestampSeconds;
      if (updates.visibility !== undefined)
        updateData.visibility = updates.visibility;

      await db
        .updateTable("learning_threads")
        .set(updateData)
        .where("id", "=", threadId)
        .execute();
    },

    async deleteThread(db, threadId) {
      await db
        .updateTable("learning_threads")
        .set({
          status: "deleted",
          updated_at: new Date(),
        })
        .where("id", "=", threadId)
        .where("status", "!=", "deleted")
        .execute();
    },

    async incrementRepliesCount(db, threadId, delta) {
      await db
        .updateTable("learning_threads")
        .set((eb) => ({
          replies_count: sql`GREATEST(0, ${eb.ref("replies_count")} + ${delta})`,
          updated_at: new Date(),
        }))
        .where("id", "=", threadId)
        .execute();
    },

    async incrementLikesCount(db, threadId, delta) {
      await db
        .updateTable("learning_threads")
        .set((eb) => ({
          likes_count: sql`GREATEST(0, ${eb.ref("likes_count")} + ${delta})`,
          updated_at: new Date(),
        }))
        .where("id", "=", threadId)
        .execute();
    },

    async setAcceptedAnswer(db, threadId, replyId) {
      await db
        .updateTable("learning_threads")
        .set({
          accepted_answer_id: replyId,
          updated_at: new Date(),
        })
        .where("id", "=", threadId)
        .execute();
    },

    async setLocked(db, threadId, isLocked) {
      await db
        .updateTable("learning_threads")
        .set({
          is_locked: isLocked,
          updated_at: new Date(),
        })
        .where("id", "=", threadId)
        .execute();
    },

    async setStatus(db, threadId, status) {
      await db
        .updateTable("learning_threads")
        .set({
          status,
          updated_at: new Date(),
        })
        .where("id", "=", threadId)
        .execute();
    },
  };
}
