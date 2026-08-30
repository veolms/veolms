import type { DatabaseExecutor } from "@veolms/database";
import type {
  EngagementTargetType,
  UserMention,
} from "@veolms/contracts";
import { sql } from "kysely";

export interface EngagementsRepository {
  findLike(
    db: DatabaseExecutor,
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<any | null>;

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
  ): Promise<any | null>;

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
  ): Promise<any | null>;

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
}

export function createEngagementsRepository(): EngagementsRepository {
  return {
    async findLike(db, userId, targetType, targetId) {
      return db
        .selectFrom("learning_likes")
        .selectAll()
        .where("user_id", "=", userId)
        .where("target_type", "=", targetType)
        .where("target_id", "=", targetId)
        .executeTakeFirst();
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
      return db
        .selectFrom("learning_bookmarks")
        .selectAll()
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
        .selectAll()
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

    async searchUsersForMention(db, query, limit) {
      const searchPattern = `%${query.toLowerCase()}%`;
      const users = await db
        .selectFrom("users")
        .select(["id", "display_name", "username", "email"])
        .where((eb) =>
          eb.or([
            eb(sql`lower(display_name)`, "like", searchPattern),
            eb(sql`lower(username)`, "like", searchPattern),
            eb(sql`lower(email)`, "like", searchPattern),
          ]),
        )
        .limit(limit)
        .execute();

      return users.map((u) => ({
        id: u.id,
        displayName: u.display_name,
        username: u.username ?? (u.email ? u.email.split("@")[0]! : "user"),
        avatarUrl: null,
      }));
    },
  };
}
