import type { DatabaseExecutor } from "@veolms/database";
import type { EngagementTargetType, UserMention } from "@veolms/contracts";
import { sql } from "kysely";

export interface EngagementExistenceRow {
  id: string;
}

export interface EngagementsRepository {
  findLike(
    db: DatabaseExecutor,
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<EngagementExistenceRow | undefined>;

  addLike(
    db: DatabaseExecutor,
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<boolean>;

  removeLike(
    db: DatabaseExecutor,
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<boolean>;

  findBookmark(
    db: DatabaseExecutor,
    userId: string,
    threadId: string,
  ): Promise<EngagementExistenceRow | undefined>;

  addBookmark(
    db: DatabaseExecutor,
    userId: string,
    threadId: string,
  ): Promise<void>;

  removeBookmark(
    db: DatabaseExecutor,
    userId: string,
    threadId: string,
  ): Promise<void>;

  findFollow(
    db: DatabaseExecutor,
    userId: string,
    threadId: string,
  ): Promise<EngagementExistenceRow | undefined>;

  addFollow(
    db: DatabaseExecutor,
    userId: string,
    threadId: string,
  ): Promise<void>;

  removeFollow(
    db: DatabaseExecutor,
    userId: string,
    threadId: string,
  ): Promise<void>;

  searchUsersForMention(
    db: DatabaseExecutor,
    options: {
      query: string;
      userIds: readonly string[];
      limit: number;
    },
  ): Promise<UserMention[]>;
}

export function createEngagementsRepository(): EngagementsRepository {
  return {
    async findLike(db, userId, targetType, targetId) {
      return db
        .selectFrom("learning_likes")
        .select("id")
        .where("user_id", "=", userId)
        .where("target_type", "=", targetType)
        .where("target_id", "=", targetId)
        .executeTakeFirst();
    },

    async addLike(db, userId, targetType, targetId) {
      const result = await db
        .insertInto("learning_likes")
        .values({
          id: sql`gen_random_uuid()`,
          user_id: userId,
          target_type: targetType,
          target_id: targetId,
        })
        .onConflict((oc) =>
          oc.columns(["user_id", "target_type", "target_id"]).doNothing(),
        )
        .executeTakeFirst();
      return Number(result?.numInsertedOrUpdatedRows ?? 0) > 0;
    },

    async removeLike(db, userId, targetType, targetId) {
      const result = await db
        .deleteFrom("learning_likes")
        .where("user_id", "=", userId)
        .where("target_type", "=", targetType)
        .where("target_id", "=", targetId)
        .executeTakeFirst();
      return Number(result?.numDeletedRows ?? 0) > 0;
    },

    async findBookmark(db, userId, threadId) {
      return db
        .selectFrom("learning_bookmarks")
        .select("id")
        .where("user_id", "=", userId)
        .where("thread_id", "=", threadId)
        .executeTakeFirst();
    },

    async addBookmark(db, userId, threadId) {
      await db
        .insertInto("learning_bookmarks")
        .values({
          id: sql`gen_random_uuid()`,
          user_id: userId,
          thread_id: threadId,
        })
        .onConflict((oc) => oc.columns(["user_id", "thread_id"]).doNothing())
        .execute();
    },

    async removeBookmark(db, userId, threadId) {
      await db
        .deleteFrom("learning_bookmarks")
        .where("user_id", "=", userId)
        .where("thread_id", "=", threadId)
        .execute();
    },

    async findFollow(db, userId, threadId) {
      return db
        .selectFrom("learning_follows")
        .select("id")
        .where("user_id", "=", userId)
        .where("thread_id", "=", threadId)
        .executeTakeFirst();
    },

    async addFollow(db, userId, threadId) {
      await db
        .insertInto("learning_follows")
        .values({
          id: sql`gen_random_uuid()`,
          user_id: userId,
          thread_id: threadId,
        })
        .onConflict((oc) => oc.columns(["user_id", "thread_id"]).doNothing())
        .execute();
    },

    async removeFollow(db, userId, threadId) {
      await db
        .deleteFrom("learning_follows")
        .where("user_id", "=", userId)
        .where("thread_id", "=", threadId)
        .execute();
    },

    async searchUsersForMention(db, { query, userIds, limit }) {
      if (userIds.length === 0) return [];

      const pattern = `%${query}%`;
      const users = await db
        .selectFrom("users")
        .select(["id", "display_name", "username"])
        .where("id", "in", [...userIds])
        .where("username", "is not", null)
        .where((eb) =>
          eb.or([
            eb(sql<string>`lower(display_name)`, "like", pattern),
            eb(sql<string>`lower(username)`, "like", pattern),
          ]),
        )
        .orderBy("username", "asc")
        .limit(limit)
        .execute();

      return users.flatMap((u) => {
        if (!u.username) return [];
        return [
          {
            id: u.id,
            displayName: u.display_name,
            username: u.username,
            avatarUrl: null,
          },
        ];
      });
    },
  };
}
