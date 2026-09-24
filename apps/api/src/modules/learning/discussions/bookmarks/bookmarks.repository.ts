import type {
  CourseLessonTable,
  CourseTable,
  Database,
  DatabaseExecutor,
  LearningBookmarkTable,
  LearningNoteTable,
  LearningThreadTable,
  UserTable,
} from "@veolms/database";
import type {
  DiscussionEntryKind,
  DiscussionVisibility,
  ListLearningThreadsQuery,
} from "@veolms/contracts";
import type { Nullable, SelectQueryBuilder } from "kysely";
import { sql } from "kysely";
import {
  type DiscussionListCursor,
  authorRoleSql,
} from "../shared/discussion.utils.ts";

export const BOOKMARKS_WORKSPACE_SORT = "bookmarked";

type BookmarksAliasedDB = Database & {
  b: LearningBookmarkTable;
  t: Nullable<LearningThreadTable>;
  n: Nullable<LearningNoteTable>;
  u: Nullable<UserTable>;
  c: Nullable<CourseTable>;
  l: Nullable<CourseLessonTable>;
};

type BookmarkAliases = "b" | "t" | "n" | "u" | "c" | "l";

export interface BookmarkWorkspaceRow {
  bookmarkId: string;
  bookmarkedAt: Date;
  itemType: "thread" | "note";
  id: string;
  kind: DiscussionEntryKind;
  title: string | null;
  content: string;
  plainText: string;
  courseId: string;
  courseTitle: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
  timestampSeconds: number | null;
  userId: string;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  authorRole: string | null;
  visibility: DiscussionVisibility;
  status: "active" | "hidden" | "deleted" | null;
  isLocked: boolean | null;
  acceptedAnswerId: string | null;
  repliesCount: number | null;
  likesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookmarkWorkspaceFilterOptions extends Pick<
  ListLearningThreadsQuery,
  "courseId" | "lessonId" | "kind" | "search" | "visibility"
> {
  academyId: string;
  currentUserId: string;
  accessibleCourseIds: readonly string[] | "all";
  pageCursor?: DiscussionListCursor;
  limit?: number;
}

const bookmarkWorkspaceSelect = [
  "b.id as bookmarkId",
  "b.created_at as bookmarkedAt",
  "b.thread_id as bookmarkThreadId",
  "b.note_id as bookmarkNoteId",
  sql<"thread" | "note">`case
    when b.thread_id is not null then 'thread'
    else 'note'
  end`.as("itemType"),
  sql<string>`case
    when b.note_id is not null then 'note'
    else t.kind
  end`.as("kind"),
  sql<string>`coalesce(t.id, n.id)`.as("id"),
  sql<string | null>`coalesce(t.title, n.title)`.as("title"),
  sql<string>`coalesce(t.content, n.content)`.as("content"),
  sql<string>`coalesce(t.plain_text, n.plain_text)`.as("plainText"),
  sql<string>`coalesce(t.course_id, n.course_id)`.as("courseId"),
  "c.title as courseTitle",
  sql<string | null>`coalesce(t.lesson_id, n.lesson_id)`.as("lessonId"),
  "l.title as lessonTitle",
  sql<number | null>`coalesce(t.timestamp_seconds, n.timestamp_seconds)`.as(
    "timestampSeconds",
  ),
  sql<string>`coalesce(t.user_id, n.user_id)`.as("userId"),
  "u.display_name as authorName",
  "u.username as authorUsername",
  "u.avatar_data_url as authorAvatarUrl",
  authorRoleSql("coalesce(t.user_id, n.user_id)"),
  sql<string>`coalesce(t.visibility, n.visibility)`.as("visibility"),
  "t.status as status",
  "t.is_locked as isLocked",
  "t.accepted_answer_id as acceptedAnswerId",
  "t.replies_count as repliesCount",
  sql<number>`coalesce(t.likes_count, n.likes_count, 0)`.as("likesCount"),
  sql<Date>`coalesce(t.created_at, n.created_at)`.as("createdAt"),
  sql<Date>`coalesce(t.updated_at, n.updated_at)`.as("updatedAt"),
] as const;

function joinBookmarkSources(db: DatabaseExecutor) {
  return db
    .selectFrom("learning_bookmarks as b")
    .leftJoin("learning_threads as t", "t.id", "b.thread_id")
    .leftJoin("learning_notes as n", "n.id", "b.note_id")
    .leftJoin("users as u", (join) =>
      join.on(sql<boolean>`u.id = coalesce(t.user_id, n.user_id)`),
    )
    .leftJoin("courses as c", (join) =>
      join.on(sql<boolean>`c.id = coalesce(t.course_id, n.course_id)`),
    )
    .leftJoin("course_lessons as l", (join) =>
      join.on(sql<boolean>`l.id = coalesce(t.lesson_id, n.lesson_id)`),
    );
}

function applyBookmarkFilters<O>(
  query: SelectQueryBuilder<BookmarksAliasedDB, BookmarkAliases, O>,
  options: BookmarkWorkspaceFilterOptions,
): SelectQueryBuilder<BookmarksAliasedDB, BookmarkAliases, O> {
  let q = query
    .where("b.user_id", "=", options.currentUserId)
    .where("c.deleted_at", "is", null)
    .where("c.id", "is not", null)
    .where(
      sql<boolean>`coalesce(t.academy_id, n.academy_id) = ${options.academyId}`,
    )
    .where(
      sql<boolean>`(
        (
          b.thread_id is not null
          and t.id is not null
          and t.status = 'active'
          and t.kind in ('question', 'comment')
          and (
            t.visibility = 'public'
            or t.user_id = ${options.currentUserId}
            or t.visibility = 'unlisted'
          )
        )
        or (
          b.note_id is not null
          and n.id is not null
          and (
            n.user_id = ${options.currentUserId}
            or n.visibility <> 'private'
          )
          and l.id is not null
          and l.course_id = n.course_id
        )
      )`,
    );

  if (options.accessibleCourseIds !== "all") {
    const courseIds = [...options.accessibleCourseIds];
    if (courseIds.length === 0) {
      q = q.where(
        sql<boolean>`b.note_id is not null and n.user_id = ${options.currentUserId}`,
      );
    } else {
      q = q.where(
        sql<boolean>`(
          coalesce(t.course_id, n.course_id) in (${sql.join(
            courseIds.map((courseId) => sql`${courseId}`),
            sql`, `,
          )})
          or (b.note_id is not null and n.user_id = ${options.currentUserId})
        )`,
      );
    }
  }

  if (options.courseId) {
    q = q.where(
      sql<boolean>`coalesce(t.course_id, n.course_id) = ${options.courseId}`,
    );
  }

  if (options.lessonId) {
    q = q.where(
      sql<boolean>`coalesce(t.lesson_id, n.lesson_id) = ${options.lessonId}`,
    );
  }

  if (options.kind && options.kind !== "all") {
    const normalizedKind = options.kind === "qna" ? "question" : options.kind;
    if (normalizedKind === "note") {
      q = q.where("b.note_id", "is not", null);
    } else {
      q = q.where("t.kind", "=", normalizedKind);
    }
  }

  if (options.visibility) {
    q = q.where(
      sql<boolean>`coalesce(t.visibility, n.visibility) = ${options.visibility}`,
    );
  }

  if (options.search) {
    const pattern = `%${options.search.toLowerCase()}%`;
    q = q.where(
      sql<boolean>`(
        lower(coalesce(t.title, '')) like ${pattern}
        or lower(coalesce(t.plain_text, '')) like ${pattern}
        or lower(coalesce(n.title, '')) like ${pattern}
        or lower(coalesce(n.plain_text, '')) like ${pattern}
      )`,
    );
  }

  if (options.pageCursor) {
    q = q.where(
      sql<boolean>`(
        b.created_at < ${options.pageCursor.createdAt}
        or (
          b.created_at = ${options.pageCursor.createdAt}
          and b.id < ${options.pageCursor.id}::uuid
        )
      )`,
    );
  }

  return q;
}

export interface BookmarksRepository {
  listWorkspaceBookmarks(
    db: DatabaseExecutor,
    options: BookmarkWorkspaceFilterOptions,
  ): Promise<BookmarkWorkspaceRow[]>;
  countWorkspaceBookmarks(
    db: DatabaseExecutor,
    options: BookmarkWorkspaceFilterOptions,
  ): Promise<number>;
}

export function createBookmarksRepository(): BookmarksRepository {
  return {
    async listWorkspaceBookmarks(db, options) {
      const query = applyBookmarkFilters(joinBookmarkSources(db), options)
        .select([...bookmarkWorkspaceSelect])
        .orderBy("b.created_at", "desc")
        .orderBy("b.id", "desc")
        .limit((options.limit ?? 20) + 1);

      return (await query.execute()) as BookmarkWorkspaceRow[];
    },

    async countWorkspaceBookmarks(db, options) {
      const row = await applyBookmarkFilters(joinBookmarkSources(db), options)
        .select(sql<number>`count(*)::int`.as("count"))
        .executeTakeFirst();

      return Number(row?.count ?? 0);
    },
  };
}
