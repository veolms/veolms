import type { DatabaseExecutor } from "@veolms/database";
import type {
  ListLearningRepliesQuery,
  UpdateLearningReplyRequest,
} from "@veolms/contracts";
import { sql } from "kysely";
import {
  authorRoleSql,
  type DiscussionListCursor,
} from "../shared/discussion.utils.ts";

export interface RepliesRepository {
  createReply(
    db: DatabaseExecutor,
    reply: {
      id: string;
      threadId: string;
      parentReplyId: string | null;
      replyToReplyId?: string | null;
      replyToUserId?: string | null;
      userId: string;
      content: string;
      plainText: string;
      timestampSeconds: number | null;
    },
  ): Promise<void>;

  findReplyById(db: DatabaseExecutor, replyId: string): Promise<any | null>;

  listRepliesByThreadId(
    db: DatabaseExecutor,
    threadId: string,
    options: ListLearningRepliesQuery & { pageCursor?: DiscussionListCursor },
  ): Promise<any[]>;

  countRepliesByThreadId(
    db: DatabaseExecutor,
    threadId: string,
  ): Promise<number>;

  updateReply(
    db: DatabaseExecutor,
    replyId: string,
    updates: UpdateLearningReplyRequest & { plainText?: string },
  ): Promise<void>;

  deleteReply(db: DatabaseExecutor, replyId: string): Promise<boolean>;

  setStatus(
    db: DatabaseExecutor,
    replyId: string,
    status: "active" | "hidden" | "deleted",
  ): Promise<void>;

  setAcceptedStatus(
    db: DatabaseExecutor,
    replyId: string,
    isAccepted: boolean,
  ): Promise<void>;

  incrementLikesCount(
    db: DatabaseExecutor,
    replyId: string,
    delta: number,
  ): Promise<void>;
}

export function createRepliesRepository(): RepliesRepository {
  return {
    async createReply(db, reply) {
      await db
        .insertInto("learning_replies")
        .values({
          id: reply.id,
          thread_id: reply.threadId,
          parent_reply_id: reply.parentReplyId,
          reply_to_reply_id: reply.replyToReplyId || null,
          reply_to_user_id: reply.replyToUserId || null,
          user_id: reply.userId,
          content: reply.content,
          plain_text: reply.plainText,
          timestamp_seconds: reply.timestampSeconds,
          is_accepted: false,
          status: "active",
          likes_count: 0,
        })
        .execute();
    },

    async findReplyById(db, replyId) {
      const row = await db
        .selectFrom("learning_replies as r")
        .innerJoin("users as u", "u.id", "r.user_id")
        .leftJoin("learning_replies as rr", "rr.id", "r.reply_to_reply_id")
        .leftJoin("users as ru", "ru.id", "r.reply_to_user_id")
        .select([
          "r.id as id",
          "r.thread_id as threadId",
          "r.parent_reply_id as parentReplyId",
          "r.reply_to_reply_id as replyToReplyId",
          "r.reply_to_user_id as replyToUserId",
          "r.user_id as userId",
          "r.content as content",
          "r.plain_text as plainText",
          "r.timestamp_seconds as timestampSeconds",
          "r.is_accepted as isAccepted",
          "r.status as status",
          "r.likes_count as likesCount",
          "r.created_at as createdAt",
          "r.updated_at as updatedAt",
          "u.display_name as authorName",
          "u.username as authorUsername",
          "u.email as authorEmail",
          authorRoleSql("r.user_id"),
          "ru.username as replyToUsername",
          "ru.display_name as replyToDisplayName",
          "rr.plain_text as replyToContent",
        ])
        .where("r.id", "=", replyId)
        .executeTakeFirst();

      return row ?? null;
    },

    async listRepliesByThreadId(db, threadId, options) {
      let query = db
        .selectFrom("learning_replies as r")
        .innerJoin("users as u", "u.id", "r.user_id")
        .leftJoin("learning_replies as rr", "rr.id", "r.reply_to_reply_id")
        .leftJoin("users as ru", "ru.id", "r.reply_to_user_id")
        .select([
          "r.id as id",
          "r.thread_id as threadId",
          "r.parent_reply_id as parentReplyId",
          "r.reply_to_reply_id as replyToReplyId",
          "r.reply_to_user_id as replyToUserId",
          "r.user_id as userId",
          "r.content as content",
          "r.plain_text as plainText",
          "r.timestamp_seconds as timestampSeconds",
          "r.is_accepted as isAccepted",
          "r.status as status",
          "r.likes_count as likesCount",
          "r.created_at as createdAt",
          "r.updated_at as updatedAt",
          "u.display_name as authorName",
          "u.username as authorUsername",
          "u.email as authorEmail",
          authorRoleSql("r.user_id"),
          "ru.username as replyToUsername",
          "ru.display_name as replyToDisplayName",
          "rr.plain_text as replyToContent",
        ])
        .where("r.thread_id", "=", threadId)
        .where("r.status", "=", "active");

      if (options.pageCursor) {
        const cursor = options.pageCursor;
        const accepted = cursor.isAccepted === true;
        query = query.where(
          sql<boolean>`(
            (
              r.is_accepted = ${accepted}
              and (
                r.created_at > ${cursor.createdAt}
                or (
                  r.created_at = ${cursor.createdAt}
                  and r.id > ${cursor.id}::uuid
                )
              )
            )
            or r.is_accepted < ${accepted}
          )`,
        );
      }

      return query
        .orderBy("r.is_accepted", "desc")
        .orderBy("r.created_at", "asc")
        .orderBy("r.id", "asc")
        .limit(options.limit + 1)
        .execute();
    },

    async countRepliesByThreadId(db, threadId) {
      const row = await db
        .selectFrom("learning_replies")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("thread_id", "=", threadId)
        .where("status", "=", "active")
        .executeTakeFirst();
      return Number(row?.count ?? 0);
    },

    async updateReply(db, replyId, updates) {
      const updateData: Record<string, any> = {
        updated_at: new Date(),
      };
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.plainText !== undefined)
        updateData.plain_text = updates.plainText;
      if (updates.timestampSeconds !== undefined)
        updateData.timestamp_seconds = updates.timestampSeconds;

      await db
        .updateTable("learning_replies")
        .set(updateData)
        .where("id", "=", replyId)
        .execute();
    },

    async deleteReply(db, replyId) {
      const result = await db
        .updateTable("learning_replies")
        .set({
          status: "deleted",
          updated_at: new Date(),
        })
        .where("id", "=", replyId)
        .where("status", "!=", "deleted")
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    async setStatus(db, replyId, status) {
      await db
        .updateTable("learning_replies")
        .set({
          status,
          updated_at: new Date(),
        })
        .where("id", "=", replyId)
        .execute();
    },

    async setAcceptedStatus(db, replyId, isAccepted) {
      await db
        .updateTable("learning_replies")
        .set({
          is_accepted: isAccepted,
          updated_at: new Date(),
        })
        .where("id", "=", replyId)
        .execute();
    },

    async incrementLikesCount(db, replyId, delta) {
      await db
        .updateTable("learning_replies")
        .set((eb) => ({
          likes_count: sql`GREATEST(0, ${eb.ref("likes_count")} + ${delta})`,
          updated_at: new Date(),
        }))
        .where("id", "=", replyId)
        .execute();
    },
  };
}
