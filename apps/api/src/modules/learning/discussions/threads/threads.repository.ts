import type {
  Database,
  DatabaseExecutor,
  CourseLessonTable,
  CourseTable,
  LearningThreadTable,
  LearningMentionTable,
  LearningReplyTable,
  LearningNoteTable,
  UserTable,
} from "@veolms/database";
import type {
  DiscussionEntryKind,
  DiscussionVisibility,
  InteractionStatus,
  ListLearningThreadsQuery,
  UpdateLearningThreadRequest,
} from "@veolms/contracts";
import type {
  ExpressionBuilder,
  Nullable,
  Selectable,
  SelectQueryBuilder,
} from "kysely";
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
type MentionsAliasedDB = Database & {
  m: LearningMentionTable;
  t: Nullable<LearningThreadTable>;
  r: Nullable<LearningReplyTable>;
  pt: Nullable<LearningThreadTable>;
  tu: Nullable<UserTable>;
  ru: Nullable<UserTable>;
  n: Nullable<LearningNoteTable>;
  nu: Nullable<UserTable>;
  tc: Nullable<CourseTable>;
  pc: Nullable<CourseTable>;
  nc: Nullable<CourseTable>;
  tl: Nullable<CourseLessonTable>;
  pl: Nullable<CourseLessonTable>;
  nl: Nullable<CourseLessonTable>;
};
type MentionAliases =
  | "m"
  | "t"
  | "r"
  | "pt"
  | "tu"
  | "ru"
  | "n"
  | "nu"
  | "tc"
  | "pc"
  | "nc"
  | "tl"
  | "pl"
  | "nl";

export interface ThreadRowWithAuthor {
  id: string;
  academyId: string;
  courseId: string;
  courseTitle: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
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
  authorAvatarUrl: string | null;
  authorRole: string | null;
}

export interface MentionWorkspaceRow {
  mentionId: string;
  itemType: "thread" | "reply" | "note";
  sourceId: string;
  mentionedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  parentThreadId: string | null;
  parentThreadTitle: string | null;
  kind: DiscussionEntryKind;
  title: string | null;
  content: string;
  plainText: string;
  timestampSeconds: number | null;
  courseId: string;
  courseTitle: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
  userId: string;
  visibility: DiscussionVisibility | null;
  status: InteractionStatus | null;
  isLocked: boolean | null;
  acceptedAnswerId: string | null;
  likesCount: number;
  repliesCount: number | null;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  authorRole: string | null;
}

export type MentionFilterOptions = Partial<
  Pick<
    ListLearningThreadsQuery,
    "courseId" | "lessonId" | "kind" | "search" | "visibility"
  >
> & {
  academyId: string;
  currentUserId: string;
  accessibleCourseIds?: readonly string[];
  pageCursor?: DiscussionListCursor;
  limit: number;
};

function createMentionSourceQuery(db: DatabaseExecutor) {
  return db
    .selectFrom("learning_mentions as m")
    .leftJoin("learning_threads as t", (join) =>
      join.onRef("t.id", "=", "m.source_id").on("m.source_type", "=", "thread"),
    )
    .leftJoin("learning_replies as r", (join) =>
      join.onRef("r.id", "=", "m.source_id").on("m.source_type", "=", "reply"),
    )
    .leftJoin("learning_notes as n", (join) =>
      join.onRef("n.id", "=", "m.source_id").on("m.source_type", "=", "note"),
    )
    .leftJoin("learning_threads as pt", "pt.id", "r.thread_id")
    .leftJoin("users as tu", "tu.id", "t.user_id")
    .leftJoin("users as ru", "ru.id", "r.user_id")
    .leftJoin("users as nu", "nu.id", "n.user_id")
    .leftJoin("courses as tc", "tc.id", "t.course_id")
    .leftJoin("courses as pc", "pc.id", "pt.course_id")
    .leftJoin("courses as nc", "nc.id", "n.course_id")
    .leftJoin("course_lessons as tl", "tl.id", "t.lesson_id")
    .leftJoin("course_lessons as pl", "pl.id", "pt.lesson_id")
    .leftJoin("course_lessons as nl", "nl.id", "n.lesson_id");
}

function applyMentionFilters<O>(
  query: SelectQueryBuilder<MentionsAliasedDB, MentionAliases, O>,
  options: MentionFilterOptions,
): SelectQueryBuilder<MentionsAliasedDB, MentionAliases, O> {
  let q = query
    .where("m.mentioned_user_id", "=", options.currentUserId)
    .where(
      sql<boolean>`(
        (
          m.source_type = 'thread'
          and t.id is not null
          and t.status = 'active'
          and t.kind in ('comment', 'question')
        )
        or (
          m.source_type = 'reply'
          and r.id is not null
          and r.status = 'active'
          and pt.id is not null
          and pt.status = 'active'
          and pt.kind in ('comment', 'question')
        )
        or (
          m.source_type = 'note'
          and n.id is not null
        )
      )`,
    )
    .where(
      sql<boolean>`(
        coalesce(tc.id, pc.id, nc.id) is not null
        and coalesce(tc.deleted_at, pc.deleted_at, nc.deleted_at) is null
        and (m.source_type <> 'note' or (nl.id is not null and nl.deleted_at is null and nl.course_id = n.course_id))
      )`,
    )
    .where(
      sql<boolean>`(
        (
          m.source_type in ('thread', 'reply')
          and (
            coalesce(t.visibility, pt.visibility) = 'public'
            or (
              coalesce(t.visibility, pt.visibility) in ('private', 'unlisted')
              and coalesce(t.user_id, pt.user_id) = ${options.currentUserId}
            )
          )
        )
        or (
          m.source_type = 'note'
          and (
            n.user_id = ${options.currentUserId}
            or n.visibility in ('public', 'unlisted')
          )
        )
      )`,
    )
    .where(
      sql<boolean>`coalesce(t.academy_id, pt.academy_id, n.academy_id) = ${options.academyId}`,
    );

  if (options.courseId) {
    q = q.where(
      sql<boolean>`coalesce(t.course_id, pt.course_id, n.course_id) = ${options.courseId}`,
    );
  } else if (options.accessibleCourseIds) {
    if (options.accessibleCourseIds.length === 0) {
      return q.where(sql<boolean>`1 = 0`);
    }
    q = q.where(
      sql<boolean>`coalesce(t.course_id, pt.course_id, n.course_id) in (${sql.join(
        options.accessibleCourseIds.map((courseId) => sql`${courseId}`),
        sql`, `,
      )})`,
    );
  }

  if (options.lessonId) {
    q = q.where(
      sql<boolean>`coalesce(t.lesson_id, pt.lesson_id, n.lesson_id) = ${options.lessonId}`,
    );
  }

  if (options.kind && options.kind !== "all") {
    const normalizedKind = options.kind === "qna" ? "question" : options.kind;
    q = q.where(
      sql<boolean>`coalesce(t.kind, pt.kind, case when m.source_type = 'note' then 'note' else null end) = ${normalizedKind}`,
    );
  }

  if (options.visibility) {
    q = q.where(
      sql<boolean>`coalesce(t.visibility, pt.visibility, n.visibility) = ${options.visibility}`,
    );
  }

  if (options.search) {
    const pattern = `%${options.search.toLowerCase()}%`;
    q = q.where(
      sql<boolean>`(
        (
          m.source_type = 'thread'
          and (
            lower(coalesce(t.title, '')) like ${pattern}
            or lower(t.plain_text) like ${pattern}
          )
        )
        or (
          m.source_type = 'reply'
          and lower(r.plain_text) like ${pattern}
        )
        or (
          m.source_type = 'note'
          and (
            lower(coalesce(n.title, '')) like ${pattern}
            or lower(n.plain_text) like ${pattern}
          )
        )
      )`,
    );
  }

  if (options.pageCursor) {
    q = q.where(
      sql<boolean>`(
        m.created_at < ${options.pageCursor.createdAt}
        or (
          m.created_at = ${options.pageCursor.createdAt}
          and m.id < ${options.pageCursor.id}::uuid
        )
      )`,
    );
  }

  return q;
}

const mentionWorkspaceSelect = [
  "m.id as mentionId",
  "m.source_type as itemType",
  "m.source_id as sourceId",
  "m.created_at as mentionedAt",
  sql<Date>`case
    when m.source_type = 'thread' then t.created_at
    when m.source_type = 'reply' then r.created_at
    else n.created_at
  end`.as("createdAt"),
  sql<Date>`case
    when m.source_type = 'thread' then t.updated_at
    when m.source_type = 'reply' then r.updated_at
    else n.updated_at
  end`.as("updatedAt"),
  sql<string | null>`case
    when m.source_type = 'reply' then pt.id
    else null
  end`.as("parentThreadId"),
  sql<string | null>`case
    when m.source_type = 'reply' then pt.title
    else null
  end`.as("parentThreadTitle"),
  sql<DiscussionEntryKind>`coalesce(t.kind, pt.kind, case when m.source_type = 'note' then 'note' else null end)`.as(
    "kind",
  ),
  sql<string | null>`case
    when m.source_type = 'note' then n.title
    else coalesce(t.title, pt.title)
  end`.as("title"),
  sql<string>`case
    when m.source_type = 'thread' then t.content
    when m.source_type = 'reply' then r.content
    else n.content
  end`.as("content"),
  sql<string>`case
    when m.source_type = 'thread' then t.plain_text
    when m.source_type = 'reply' then r.plain_text
    else n.plain_text
  end`.as("plainText"),
  sql<number | null>`case
    when m.source_type = 'thread' then t.timestamp_seconds
    when m.source_type = 'reply' then r.timestamp_seconds
    else n.timestamp_seconds
  end`.as("timestampSeconds"),
  sql<string>`coalesce(t.course_id, pt.course_id, n.course_id)`.as("courseId"),
  sql<string | null>`coalesce(tc.title, pc.title, nc.title)`.as("courseTitle"),
  sql<string | null>`coalesce(t.lesson_id, pt.lesson_id, n.lesson_id)`.as(
    "lessonId",
  ),
  sql<string | null>`coalesce(tl.title, pl.title, nl.title)`.as("lessonTitle"),
  sql<string>`coalesce(t.user_id, r.user_id, n.user_id)`.as("userId"),
  sql<string | null>`coalesce(t.visibility, pt.visibility, n.visibility)`.as(
    "visibility",
  ),
  sql<InteractionStatus | null>`case
    when m.source_type = 'thread' then t.status
    else null
  end`.as("status"),
  sql<boolean | null>`case
    when m.source_type = 'thread' then t.is_locked
    else null
  end`.as("isLocked"),
  sql<string | null>`case
    when m.source_type = 'thread' then t.accepted_answer_id
    else null
  end`.as("acceptedAnswerId"),
  sql<number>`coalesce(t.likes_count, r.likes_count, n.likes_count, 0)`.as(
    "likesCount",
  ),
  sql<number | null>`case
    when m.source_type = 'thread' then t.replies_count
    else null
  end`.as("repliesCount"),
  sql<
    string | null
  >`coalesce(tu.display_name, ru.display_name, nu.display_name)`.as(
    "authorName",
  ),
  sql<string | null>`coalesce(tu.username, ru.username, nu.username)`.as(
    "authorUsername",
  ),
  sql<
    string | null
  >`coalesce(tu.avatar_data_url, ru.avatar_data_url, nu.avatar_data_url)`.as(
    "authorAvatarUrl",
  ),
  authorRoleSql("coalesce(t.user_id, r.user_id, n.user_id)"),
] as const;

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

  lockThreadById(db: DatabaseExecutor, threadId: string): Promise<boolean>;

  listThreads(
    db: DatabaseExecutor,
    options: ThreadFilterOptions,
  ): Promise<ThreadRowWithAuthor[]>;

  countThreads(
    db: DatabaseExecutor,
    options: ThreadFilterOptions,
  ): Promise<number>;

  listMentionItems(
    db: DatabaseExecutor,
    options: MentionFilterOptions,
  ): Promise<MentionWorkspaceRow[]>;

  countMentionItems(
    db: DatabaseExecutor,
    options: MentionFilterOptions,
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
      if (options.tab === "following") {
        q = q
          .where("t.visibility", "=", "unlisted")
          .where((eb: ExpressionBuilder<ThreadsAliasedDB, "t">) =>
            eb.or([
              eb("t.user_id", "=", currentUserId),
              eb.exists(
                eb
                  .selectFrom("learning_follows as lf")
                  .select(sql`1`.as("one"))
                  .whereRef("lf.thread_id", "=", "t.id")
                  .where("lf.user_id", "=", currentUserId),
              ),
            ]),
          );
      } else {
        q = q
          .where("t.visibility", "=", "unlisted")
          .where("t.user_id", "=", currentUserId);
      }
    } else if (options.visibility === "public") {
      q = q.where("t.visibility", "=", "public");
    } else {
      q = q.where((eb: ExpressionBuilder<ThreadsAliasedDB, "t">) => {
        const visibilityConditions = [
          eb("t.visibility", "=", "public"),
          eb.and([
            eb("t.visibility", "in", ["private", "unlisted"]),
            eb("t.user_id", "=", currentUserId),
          ]),
        ];

        // An unlisted thread is not generally discoverable, but a user who
        // explicitly follows one should still see it in their Following
        // feed while canonical course access remains valid. The Following
        // filter below still requires the relationship to exist.
        if (options.tab === "following") {
          visibilityConditions.push(
            eb.and([
              eb("t.visibility", "=", "unlisted"),
              eb.exists(
                eb
                  .selectFrom("learning_follows as lf")
                  .select(sql`1`.as("one"))
                  .whereRef("lf.thread_id", "=", "t.id")
                  .where("lf.user_id", "=", currentUserId),
              ),
            ]),
          );
        }

        return eb.or(visibilityConditions);
      });
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
              .where("lr.status", "=", "active")
              .where("m.mentioned_user_id", "=", currentUserId),
          ),
        ]),
      );
    }
  }

  if (options.tab === "q-and-a") {
    q = q.where("t.kind", "=", "question");
  } else if (options.tab === "comments") {
    q = q.where("t.kind", "=", "comment");
  } else if (options.tab === "following") {
    q = q.where("t.kind", "in", ["comment", "question"]);
    if (!options.currentUserId) {
      q = q.where(sql<boolean>`1 = 0`);
    } else {
      const currentUserId = options.currentUserId;
      q = q.where((eb: ExpressionBuilder<ThreadsAliasedDB, "t">) =>
        eb.exists(
          eb
            .selectFrom("learning_follows as lf")
            .select(sql`1`.as("one"))
            .whereRef("lf.thread_id", "=", "t.id")
            .where("lf.user_id", "=", currentUserId),
        ),
      );
    }
  } else if (options.tab === "saved") {
    if (!options.currentUserId) {
      q = q.where(sql<boolean>`1 = 0`);
    } else {
      const currentUserId = options.currentUserId;
      q = q.where((eb: ExpressionBuilder<ThreadsAliasedDB, "t">) =>
        eb.exists(
          eb
            .selectFrom("learning_bookmarks as lb")
            .select(sql`1`.as("one"))
            .whereRef("lb.thread_id", "=", "t.id")
            .where("lb.user_id", "=", currentUserId),
        ),
      );
    }
  } else if (options.tab === "mentions") {
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
              .where("lr.status", "=", "active")
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
        .leftJoin("courses as c", "c.id", "t.course_id")
        .leftJoin("course_lessons as cl", "cl.id", "t.lesson_id")
        .select([
          "t.id as id",
          "t.academy_id as academyId",
          "t.course_id as courseId",
          "c.title as courseTitle",
          "t.lesson_id as lessonId",
          "cl.title as lessonTitle",
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
          "u.avatar_data_url as authorAvatarUrl",
          authorRoleSql("t.user_id"),
        ])
        .where("t.id", "=", threadId)
        .executeTakeFirst();

      return (row as ThreadRowWithAuthor | undefined) ?? null;
    },

    async lockThreadById(db, threadId) {
      const row = await db
        .selectFrom("learning_threads")
        .select("id")
        .where("id", "=", threadId)
        .forUpdate()
        .executeTakeFirst();

      return Boolean(row);
    },

    async listThreads(db, options) {
      let filtered = db.selectFrom("learning_threads as t");
      filtered = applyThreadFilters(filtered, options);
      filtered = applyThreadCursor(filtered, options);

      let query = filtered
        .innerJoin("users as u", "u.id", "t.user_id")
        .leftJoin("courses as c", "c.id", "t.course_id")
        .leftJoin("course_lessons as cl", "cl.id", "t.lesson_id")
        .select([
          "t.id as id",
          "t.academy_id as academyId",
          "t.course_id as courseId",
          "c.title as courseTitle",
          "t.lesson_id as lessonId",
          "cl.title as lessonTitle",
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
          "u.avatar_data_url as authorAvatarUrl",
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

    async listMentionItems(db, options) {
      let query = createMentionSourceQuery(db);
      query = applyMentionFilters(query, options);
      const rows = await query
        .select(mentionWorkspaceSelect)
        .orderBy("m.created_at", "desc")
        .orderBy("m.id", "desc")
        .limit(options.limit + 1)
        .execute();
      return rows as MentionWorkspaceRow[];
    },

    async countMentionItems(db, options) {
      let query = createMentionSourceQuery(db);
      query = applyMentionFilters(query, {
        ...options,
        pageCursor: undefined,
      });
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
      const replyRows = await db
        .selectFrom("learning_replies")
        .select("id")
        .where("thread_id", "=", threadId)
        .execute();

      await db
        .updateTable("learning_threads")
        .set({
          status: "deleted",
          updated_at: new Date(),
        })
        .where("id", "=", threadId)
        .where("status", "!=", "deleted")
        .execute();

      await db
        .updateTable("learning_replies")
        .set({
          status: "deleted",
          updated_at: new Date(),
        })
        .where("thread_id", "=", threadId)
        .where("status", "!=", "deleted")
        .execute();

      await db
        .deleteFrom("learning_follows")
        .where("thread_id", "=", threadId)
        .execute();

      await db
        .deleteFrom("learning_mentions")
        .where("source_type", "=", "thread")
        .where("source_id", "=", threadId)
        .execute();

      const replyIds = replyRows.map((row) => row.id);
      if (replyIds.length > 0) {
        await db
          .deleteFrom("learning_mentions")
          .where("source_type", "=", "reply")
          .where("source_id", "in", replyIds)
          .execute();
      }

      await db
        .updateTable("learning_attachments")
        .set({ status: "deleted" })
        .where((eb) =>
          eb.or([
            eb.and([
              eb("target_type", "=", "thread"),
              eb("target_id", "=", threadId),
            ]),
            eb.and([
              eb("target_type", "=", "reply"),
              eb(
                "target_id",
                "in",
                eb
                  .selectFrom("learning_replies")
                  .select("id")
                  .where("thread_id", "=", threadId),
              ),
            ]),
          ]),
        )
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
