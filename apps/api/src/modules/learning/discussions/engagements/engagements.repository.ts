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

  findNoteBookmark(
    db: DatabaseExecutor,
    userId: string,
    noteId: string,
  ): Promise<EngagementExistenceRow | undefined>;

  addNoteBookmark(
    db: DatabaseExecutor,
    userId: string,
    noteId: string,
  ): Promise<void>;

  removeNoteBookmark(
    db: DatabaseExecutor,
    userId: string,
    noteId: string,
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
      userIds?: readonly string[] | "all";
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

    async findNoteBookmark(db, userId, noteId) {
      return db
        .selectFrom("learning_bookmarks")
        .select("id")
        .where("user_id", "=", userId)
        .where("note_id", "=", noteId)
        .executeTakeFirst();
    },

    async addNoteBookmark(db, userId, noteId) {
      await db
        .insertInto("learning_bookmarks")
        .values({
          id: sql`gen_random_uuid()`,
          user_id: userId,
          thread_id: null,
          note_id: noteId,
        })
        .onConflict((oc) => oc.columns(["user_id", "note_id"]).doNothing())
        .execute();
    },

    async removeNoteBookmark(db, userId, noteId) {
      await db
        .deleteFrom("learning_bookmarks")
        .where("user_id", "=", userId)
        .where("note_id", "=", noteId)
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
      if (Array.isArray(userIds) && userIds.length === 0) return [];

      const cleanQuery = query.toLowerCase();
      const pattern = `%${cleanQuery}%`;
      const prefixPattern = `${cleanQuery}%`;
      const wordPattern = `% ${cleanQuery}%`;

      let queryBuilder = db
        .selectFrom("users")
        .select(["id", "display_name", "username", "avatar_data_url"])
        .where("username", "is not", null)
        .where("is_deleted", "=", false)
        .where((eb) =>
          eb.or([
            eb(sql<string>`lower(display_name)`, "like", pattern),
            eb(sql<string>`lower(username)`, "like", pattern),
          ]),
        );

      if (Array.isArray(userIds) && userIds.length > 0) {
        queryBuilder = queryBuilder.where("id", "in", [...userIds]);
      }

      const users = await queryBuilder
        .orderBy(
          sql`CASE
            WHEN lower(username) = ${cleanQuery} THEN 1
            WHEN lower(display_name) = ${cleanQuery} THEN 2
            WHEN lower(username) LIKE ${prefixPattern} THEN 3
            WHEN lower(display_name) LIKE ${prefixPattern} THEN 4
            WHEN lower(display_name) LIKE ${wordPattern} THEN 5
            WHEN lower(username) LIKE ${pattern} THEN 6
            ELSE 7
          END`,
          "asc",
        )
        .orderBy("username", "asc")
        .limit(limit)
        .execute();

      return users.flatMap((u) => {
        if (!u.username) return [];
        return [
          {
            id: u.id,
            displayName: u.display_name || u.username,
            username: u.username,
            avatarUrl: u.avatar_data_url ?? null,
          },
        ];
      });
    },
  };
}
