import type { DatabaseExecutor } from "@veolms/database";
import type {
  DiscussionEntryKind,
  DiscussionVisibility,
  ListLearningThreadsQuery,
  UpdateLearningThreadRequest,
} from "@veolms/contracts";
import { sql } from "kysely";

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
  ): Promise<any | null>;

  listThreads(
    db: DatabaseExecutor,
    options: ListLearningThreadsQuery & { academyId: string; currentUserId?: string },
  ): Promise<any[]>;

  updateThread(
    db: DatabaseExecutor,
    threadId: string,
    updates: UpdateLearningThreadRequest & { plainText?: string },
  ): Promise<void>;

  deleteThread(
    db: DatabaseExecutor,
    threadId: string,
  ): Promise<void>;

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
    status: "active" | "hidden" | "deleted",
  ): Promise<void>;
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
          "u.email as authorEmail",
        ])
        .where("t.id", "=", threadId)
        .executeTakeFirst();

      return row ?? null;
    },

    async listThreads(db, options) {
      let query = db
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
          "u.email as authorEmail",
        ])
        .where("t.status", "=", "active");

      if (options.courseId) {
        query = query.where("t.course_id", "=", options.courseId);
      }

      if (options.lessonId) {
        query = query.where("t.lesson_id", "=", options.lessonId);
      }

      if (options.kind && options.kind !== "all") {
        const normalizedKind = options.kind === "qna" ? "question" : options.kind;
        query = query.where("t.kind", "=", normalizedKind);
      }

      // Visibility and ownership rules
      if (options.mine || options.sort === "me") {
        if (options.currentUserId) {
          query = query.where("t.user_id", "=", options.currentUserId);
        } else {
          // Unauthenticated caller filtering by mine returns empty set
          query = query.where(sql<boolean>`1 = 0`);
        }
      } else if (options.currentUserId) {
        if (options.visibility === "private") {
          query = query.where("t.visibility", "=", "private").where("t.user_id", "=", options.currentUserId);
        } else if (options.visibility === "unlisted") {
          query = query.where("t.visibility", "=", "unlisted").where("t.user_id", "=", options.currentUserId);
        } else if (options.visibility === "public") {
          query = query.where("t.visibility", "=", "public");
        } else {
          // Return public items, or user's own items (including unlisted and private)
          query = query.where((eb) =>
            eb.or([
              eb("t.visibility", "=", "public"),
              eb.and([
                eb("t.visibility", "in", ["private", "unlisted"]),
                eb("t.user_id", "=", options.currentUserId!),
              ]),
            ]),
          );
        }
      } else {
        query = query.where("t.visibility", "=", "public");
      }

      if (options.search) {
        const searchPattern = `%${options.search.toLowerCase()}%`;
        query = query.where((eb) =>
          eb.or([
            eb(sql`lower(t.title)`, "like", searchPattern),
            eb(sql`lower(t.plain_text)`, "like", searchPattern),
          ]),
        );
      }

      if (options.status === "answered") {
        query = query.where("t.replies_count", ">", 0);
      } else if (options.status === "solved") {
        query = query.where("t.accepted_answer_id", "is not", null);
      } else if (options.status === "open") {
        query = query
          .where("t.replies_count", "=", 0)
          .where("t.accepted_answer_id", "is", null);
      }

      if (options.sort === "highest_engagement" || options.sort === "popular") {
        query = query
          .orderBy(sql`(${sql.ref("t.likes_count")} + ${sql.ref("t.replies_count")})`, "desc")
          .orderBy("t.created_at", "desc");
      } else if (options.sort === "replies") {
        query = query.orderBy("t.replies_count", "desc").orderBy("t.created_at", "desc");
      } else if (options.sort === "activity") {
        query = query.orderBy("t.updated_at", "desc");
      } else {
        // "latest", "recent", "me", default
        query = query.orderBy("t.created_at", "desc");
      }

      return query.limit(options.limit).execute();
    },

    async updateThread(db, threadId, updates) {
      const updateData: Record<string, any> = {
        updated_at: new Date(),
      };
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.plainText !== undefined) updateData.plain_text = updates.plainText;
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
        .deleteFrom("learning_threads")
        .where("id", "=", threadId)
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
