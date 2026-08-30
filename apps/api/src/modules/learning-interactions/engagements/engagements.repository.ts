import type { DatabaseExecutor } from "@veolms/database";
import type { EngagementTargetType, UserMention } from "@veolms/contracts";
import { sql } from "kysely";

export interface EngagementsRepository {
  findLike(
    db: DatabaseExecutor,
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<boolean>;

  addLike(
    db: DatabaseExecutor,
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<void>;

  removeLike(
    db: DatabaseExecutor,
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<void>;

  findBookmark(
    db: DatabaseExecutor,
    userId: string,
    threadId: string,
  ): Promise<boolean>;

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
  ): Promise<boolean>;

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
    query: string,
    limit: number,
  ): Promise<UserMention[]>;

  addMention(
    db: DatabaseExecutor,
    sourceType: EngagementTargetType,
    sourceId: string,
    mentionedUserId: string,
  ): Promise<void>;
}

export function createEngagementsRepository(): EngagementsRepository {
  return {
    async findLike(db, userId, targetType, targetId) {
      const row = await db
        .selectFrom("learning_likes")
        .select("id")
        .where("user_id", "=", userId)
        .where("target_type", "=", targetType)
        .where("target_id", "=", targetId)
        .executeTakeFirst();

      return Boolean(row);
    },

    async addLike(db, userId, targetType, targetId) {
      await db
        .insertInto("learning_likes")
        .values({
          id: sql`gen_random_uuid()`,
          user_id: userId,
          target_type: targetType,
          target_id: targetId,
        })
        .onConflict((oc) => oc.columns(["user_id", "target_type", "target_id"]).doNothing())
        .execute();
    },

    async removeLike(db, userId, targetType, targetId) {
      await db
        .deleteFrom("learning_likes")
        .where("user_id", "=", userId)
        .where("target_type", "=", targetType)
        .where("target_id", "=", targetId)
        .execute();
    },

    async findBookmark(db, userId, threadId) {
      const row = await db
        .selectFrom("learning_bookmarks")
        .select("id")
        .where("user_id", "=", userId)
        .where("thread_id", "=", threadId)
        .executeTakeFirst();

      return Boolean(row);
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
      const row = await db
        .selectFrom("learning_follows")
        .select("id")
        .where("user_id", "=", userId)
        .where("thread_id", "=", threadId)
        .executeTakeFirst();

      return Boolean(row);
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

    async searchUsersForMention(db, searchPattern, limit) {
      const rows = await db
        .selectFrom("users")
        .select(["id", "username", "display_name", "email"])
        .where((eb) =>
          eb.or([
            eb(sql`lower(username)`, "like", `%${searchPattern.toLowerCase()}%`),
            eb(sql`lower(display_name)`, "like", `%${searchPattern.toLowerCase()}%`),
            eb(sql`lower(email)`, "like", `%${searchPattern.toLowerCase()}%`),
          ]),
        )
        .limit(limit)
        .execute();

      return rows.map((u) => ({
        id: u.id,
        username: u.username || (u.email ? u.email.split("@")[0]! : "user"),
        displayName: u.display_name || "User",
        avatarUrl: `/assets/${u.id.charCodeAt(0) % 2 === 0 ? "sofia" : "ethan"}-avatar-160.webp`,
      }));
    },

    async addMention(db, sourceType, sourceId, mentionedUserId) {
      await db
        .insertInto("learning_mentions")
        .values({
          id: sql`gen_random_uuid()`,
          source_type: sourceType,
          source_id: sourceId,
          mentioned_user_id: mentionedUserId,
        })
        .execute();
    },
  };
}
