import type { DatabaseExecutor } from "@veolms/database";
import type {
  ListLearningRepliesQuery,
  UpdateLearningReplyRequest,
} from "@veolms/contracts";

export interface RepliesRepository {
  createReply(
    db: DatabaseExecutor,
    reply: {
      id: string;
      threadId: string;
      parentReplyId: string | null;
      userId: string;
      content: string;
      plainText: string;
      timestampSeconds: number | null;
    },
  ): Promise<void>;

  findReplyById(
    db: DatabaseExecutor,
    replyId: string,
  ): Promise<any | null>;

  listRepliesByThreadId(
    db: DatabaseExecutor,
    threadId: string,
    options: ListLearningRepliesQuery,
  ): Promise<any[]>;

  updateReply(
    db: DatabaseExecutor,
    replyId: string,
    updates: UpdateLearningReplyRequest & { plainText?: string },
  ): Promise<void>;

  softDeleteReply(
    db: DatabaseExecutor,
    replyId: string,
  ): Promise<void>;

  setAcceptedStatus(
    db: DatabaseExecutor,
    replyId: string,
    isAccepted: boolean,
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
        .select([
          "r.id as id",
          "r.thread_id as threadId",
          "r.parent_reply_id as parentReplyId",
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
        ])
        .where("r.id", "=", replyId)
        .where("r.deleted_at", "is", null)
        .executeTakeFirst();

      return row ?? null;
    },

    async listRepliesByThreadId(db, threadId, options) {
      return db
        .selectFrom("learning_replies as r")
        .innerJoin("users as u", "u.id", "r.user_id")
        .select([
          "r.id as id",
          "r.thread_id as threadId",
          "r.parent_reply_id as parentReplyId",
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
        ])
        .where("r.thread_id", "=", threadId)
        .where("r.deleted_at", "is", null)
        .where("r.status", "=", "active")
        .orderBy("r.is_accepted", "desc")
        .orderBy("r.created_at", "asc")
        .limit(options.limit)
        .execute();
    },

    async updateReply(db, replyId, updates) {
      const updateData: Record<string, any> = {
        updated_at: new Date(),
      };
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.plainText !== undefined) updateData.plain_text = updates.plainText;
      if (updates.timestampSeconds !== undefined)
        updateData.timestamp_seconds = updates.timestampSeconds;

      await db
        .updateTable("learning_replies")
        .set(updateData)
        .where("id", "=", replyId)
        .execute();
    },

    async softDeleteReply(db, replyId) {
      await db
        .updateTable("learning_replies")
        .set({
          status: "deleted",
          deleted_at: new Date(),
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
  };
}
