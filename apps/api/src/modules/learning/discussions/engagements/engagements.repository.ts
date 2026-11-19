import type { DatabaseExecutor } from "@veolms/database";
import type {
  DiscussionReactionType,
  EngagementTargetType,
  ReactionAuthor,
  UserAutocompleteItem,
} from "@veolms/contracts";
import { sql } from "kysely";
import { escapeLikePattern } from "../../../../lib/like-pattern.ts";
import { isCourseParticipant } from "../shared/discussion.mentions.ts";
import { fuzzyMatchesAny } from "../../../../lib/fuzzy-search.ts";
import {
  authorRoleSql,
  mapAuthorRole,
  type DiscussionListCursor,
  encodeDiscussionCursor,
} from "../shared/discussion.utils.ts";
import { toIsoString } from "../shared/discussion.presenters.ts";

export interface EngagementExistenceRow {
  id: string;
}

export interface EngagementLikeRow {
  id: string;
  reaction_type?: DiscussionReactionType;
}

export interface SetReactionResult {
  liked: boolean;
  reaction: DiscussionReactionType | null;
  changedCount: number;
}

export interface EngagementsRepository {
  findLike(
    db: DatabaseExecutor,
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<EngagementLikeRow | undefined>;

  setReaction(
    db: DatabaseExecutor,
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
    reaction: DiscussionReactionType,
  ): Promise<SetReactionResult>;

  listReactions(
    db: DatabaseExecutor,
    targetType: EngagementTargetType,
    targetId: string,
    filterReaction?: DiscussionReactionType,
    limit?: number,
    pageCursor?: DiscussionListCursor,
  ): Promise<{
    users: ReactionAuthor[];
    counts: Record<string, number>;
    nextCursor?: string | null;
  }>;

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
      /** Only participants of this course are listed. */
      courseId: string;
      limit: number;
    },
  ): Promise<UserAutocompleteItem[]>;
}

export function createEngagementsRepository(): EngagementsRepository {
  return {
    async findLike(db, userId, targetType, targetId) {
      const row = await db
        .selectFrom("learning_likes")
        .select([
          "id",
          sql<DiscussionReactionType>`coalesce(reaction_type, 'like')`.as(
            "reaction_type",
          ),
        ])
        .where("user_id", "=", userId)
        .where("target_type", "=", targetType)
        .where("target_id", "=", targetId)
        .executeTakeFirst();
      return row ? { id: row.id, reaction_type: row.reaction_type } : undefined;
    },

    async setReaction(db, userId, targetType, targetId, reaction) {
      const existing = await db
        .selectFrom("learning_likes")
        .select([
          "id",
          sql<DiscussionReactionType>`coalesce(reaction_type, 'like')`.as(
            "reaction_type",
          ),
        ])
        .where("user_id", "=", userId)
        .where("target_type", "=", targetType)
        .where("target_id", "=", targetId)
        .executeTakeFirst();

      if (existing) {
        if (existing.reaction_type === reaction) {
          // Same reaction pressed again: remove it (unlike)
          const deleteResult = await db
            .deleteFrom("learning_likes")
            .where("id", "=", existing.id)
            .executeTakeFirst();
          const numDeleted = Number(deleteResult.numDeletedRows ?? 0n);
          if (numDeleted === 0) {
            return { liked: false, reaction: null, changedCount: 0 };
          }
          return { liked: false, reaction: null, changedCount: -1 };
        }
        // Different reaction selected: update it in place
        const updateResult = await db
          .updateTable("learning_likes")
          .set({ reaction_type: reaction })
          .where("id", "=", existing.id)
          .executeTakeFirst();
        const numUpdated = Number(updateResult.numUpdatedRows ?? 0n);
        if (numUpdated === 0) {
          return { liked: false, reaction: null, changedCount: 0 };
        }
        return { liked: true, reaction, changedCount: 0 };
      }

      // Not reacted yet: insert new reaction
      await db
        .insertInto("learning_likes")
        .values({
          id: sql`gen_random_uuid()`,
          user_id: userId,
          target_type: targetType,
          target_id: targetId,
          reaction_type: reaction,
        })
        .execute();
      return { liked: true, reaction, changedCount: 1 };
    },

    async listReactions(
      db,
      targetType,
      targetId,
      filterReaction,
      limit = 50,
      pageCursor,
    ) {
      const countRows = await db
        .selectFrom("learning_likes")
        .select([
          sql<string>`coalesce(reaction_type, 'like')`.as("reaction_type"),
          sql<number>`count(*)::int`.as("count"),
        ])
        .where("target_type", "=", targetType)
        .where("target_id", "=", targetId)
        .groupBy(sql`coalesce(reaction_type, 'like')`)
        .execute();

      const counts: Record<string, number> & { all: number } = { all: 0 };
      for (const row of countRows) {
        const c = Number(row.count);
        counts[row.reaction_type] = c;
        counts.all += c;
      }

      let query = db
        .selectFrom("learning_likes as l")
        .innerJoin("users as u", "u.id", "l.user_id")
        .select([
          "l.id as likeId",
          "u.id",
          "u.display_name as displayName",
          "u.username",
          "u.avatar_data_url as avatarUrl",
          authorRoleSql("u.id"),
          sql<DiscussionReactionType>`coalesce(l.reaction_type, 'like')`.as(
            "reaction",
          ),
          "l.created_at as createdAt",
        ])
        .where("l.target_type", "=", targetType)
        .where("l.target_id", "=", targetId)
        .where("u.is_deleted", "=", false);

      if (filterReaction) {
        query = query.where(
          sql`coalesce(l.reaction_type, 'like')`,
          "=",
          filterReaction,
        );
      }

      if (pageCursor) {
        query = query.where(
          sql`(l.created_at, l.id)`,
          "<",
          sql`(${pageCursor.createdAt}, ${pageCursor.id})`,
        );
      }

      const rows = await query
        .orderBy("l.created_at", "desc")
        .orderBy("l.id", "desc")
        .limit(limit + 1)
        .execute();

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      let nextCursor: string | null = null;
      if (hasMore && page.length > 0) {
        const last = page[page.length - 1]!;
        nextCursor = encodeDiscussionCursor({
          id: last.likeId,
          createdAt: new Date(last.createdAt),
        });
      }

      const users: ReactionAuthor[] = page.map((r) => ({
        id: r.id,
        displayName: r.displayName || "Learner",
        username: r.username,
        avatarUrl: r.avatarUrl,
        role: mapAuthorRole(r.authorRole),
        reaction: r.reaction,
        createdAt: toIsoString(r.createdAt),
      }));

      return { users, counts, nextCursor };
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

    async searchUsersForMention(db, { query, courseId, limit }) {
      const cleanQuery = query.toLowerCase();
      // "%", "_" and "\" are matched as typed. The two exact-match ranks
      // below compare `cleanQuery` itself, so it stays unescaped.
      const escapedQuery = escapeLikePattern(cleanQuery);
      const pattern = `%${escapedQuery}%`;
      const prefixPattern = `${escapedQuery}%`;
      const wordPattern = `% ${escapedQuery}%`;

      const queryBuilder = db
        .selectFrom("users")
        .select(["display_name", "username", "avatar_data_url"])
        .where("username", "is not", null)
        .where("is_deleted", "=", false)
        .where((eb) =>
          eb.or([
            eb(sql<string>`lower(display_name)`, "like", pattern),
            eb(sql<string>`lower(username)`, "like", pattern),
            fuzzyMatchesAny(cleanQuery, [
              sql.ref("display_name"),
              sql.ref("username"),
            ]),
          ]),
        )
        .where(isCourseParticipant(courseId));

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
            displayName: u.display_name || u.username,
            username: u.username,
            avatarUrl: u.avatar_data_url ?? null,
          },
        ];
      });
    },
  };
}
