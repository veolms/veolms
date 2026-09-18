import type {
  DatabaseExecutor,
  LearningAttachmentTable,
} from "@veolms/database";
import type { Selectable } from "kysely";
import { sql } from "kysely";
import type {
  CreateLearningThreadRequest,
  DiscussionAttachmentSummary,
  DiscussionsWorkspaceResponse,
  LearningThread,
  LearningThreadsListResponse,
  ListLearningThreadsQuery,
  QuestionFilterStatus,
  UpdateLearningThreadRequest,
  WorkspaceDiscussionItem,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import {
  createDiscussionOutbox,
  syncMentionsAndNotify,
  withWriteTransaction,
} from "../shared/discussion.mentions.ts";
import {
  authorRoleSql,
  createdAtIdDescSql,
  decodeDiscussionCursor,
  encodeDiscussionCursor,
  extractPlainText,
  mapAuthorRole,
  normalizeThreadSort,
  resolveAcademyId,
  takePage,
  toDate,
} from "../shared/discussion.utils.ts";
import {
  createDiscussionAccess,
  type DiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import { getAttachmentDimensionFields } from "../shared/discussion-attachment-metadata.ts";
import type {
  ThreadsRepository,
  ThreadRowWithAuthor,
} from "./threads.repository.ts";
import type {
  AttachmentsRepository,
  ThreadAttachmentSummary,
} from "../attachments/attachments.repository.ts";

type LearningAttachmentRow = Selectable<LearningAttachmentTable>;

function assertVisibilityAllowed(
  kind: string,
  visibility: string | undefined,
): void {
  if (!visibility) return;
  const normalized = kind === "qna" ? "question" : kind;
  if (
    (normalized === "comment" || normalized === "question") &&
    visibility === "private"
  ) {
    throw httpError(
      400,
      "INVALID_VISIBILITY",
      "Comments and Q&A questions can only be 'public' or 'unlisted'.",
    );
  }
}

export interface ThreadsService {
  createThread(
    db: DatabaseExecutor,
    input: {
      userId: string;
      roles: readonly string[];
      courseId: string;
      lessonId?: string | null;
      kind: CreateLearningThreadRequest["kind"];
      title?: string;
      content: string;
      timestampSeconds?: number | null;
      visibility?: CreateLearningThreadRequest["visibility"];
      attachmentIds?: string[];
    },
  ): Promise<LearningThread>;

  getThread(
    db: DatabaseExecutor,
    threadId: string,
    actor: DiscussionActor,
  ): Promise<LearningThread>;

  listThreads(
    db: DatabaseExecutor,
    query: ListLearningThreadsQuery & {
      currentUserId?: string;
      roles?: readonly string[];
    },
  ): Promise<LearningThreadsListResponse>;

  updateThread(
    db: DatabaseExecutor,
    threadId: string,
    actor: DiscussionActor,
    updates: UpdateLearningThreadRequest,
  ): Promise<LearningThread>;

  deleteThread(
    db: DatabaseExecutor,
    threadId: string,
    actor: DiscussionActor,
  ): Promise<void>;

  getDiscussionsWorkspace(
    db: DatabaseExecutor,
    query: ListLearningThreadsQuery & {
      currentUserId?: string;
      roles?: readonly string[];
    },
  ): Promise<DiscussionsWorkspaceResponse>;
}

export function createThreadsService(
  threadsRepo: ThreadsRepository,
  attachmentsRepo: AttachmentsRepository,
  courseAccess: DiscussionAccess = createDiscussionAccess(),
): ThreadsService {
  const outbox = createDiscussionOutbox();

  const emptyAttachmentSummary = (): DiscussionAttachmentSummary => ({
    count: 0,
    hasImages: false,
    hasVideos: false,
    hasFiles: false,
  });

  const indexAttachmentSummaries = (
    summaries: readonly ThreadAttachmentSummary[],
  ): Map<string, DiscussionAttachmentSummary> =>
    new Map(
      summaries.map((summary) => [summary.targetId, summary.attachmentSummary]),
    );

  function mapThreadRow(
    row: ThreadRowWithAuthor,
    currentUserId?: string,
    attachments: LearningAttachmentRow[] = [],
    engagements?: {
      likedThreadIds?: Set<string>;
      bookmarkedThreadIds?: Set<string>;
      followedThreadIds?: Set<string>;
      mentionedThreadIds?: Set<string>;
    },
  ): LearningThread {
    const isOwn = currentUserId ? row.userId === currentUserId : false;
    const isLiked = engagements?.likedThreadIds
      ? engagements.likedThreadIds.has(row.id)
      : false;
    const isBookmarked = engagements?.bookmarkedThreadIds
      ? engagements.bookmarkedThreadIds.has(row.id)
      : false;
    const isFollowing = engagements?.followedThreadIds
      ? engagements.followedThreadIds.has(row.id)
      : false;
    const isMentioned = engagements?.mentionedThreadIds
      ? engagements.mentionedThreadIds.has(row.id)
      : false;

    return {
      id: row.id,
      academyId: row.academyId,
      courseId: row.courseId,
      courseTitle: row.courseTitle ?? null,
      lessonId: row.lessonId ?? null,
      lessonTitle: row.lessonTitle ?? null,
      userId: row.userId,
      author: {
        id: row.userId,
        displayName: row.authorName || "Anonymous Learner",
        username: row.authorUsername || `user-${row.userId.slice(0, 8)}`,
        avatarUrl: row.authorAvatarUrl,
        role: mapAuthorRole(row.authorRole),
      },
      kind: row.kind,
      title: row.title ?? null,
      content: row.content,
      plainText: row.plainText,
      timestampSeconds: row.timestampSeconds ?? null,
      visibility: row.visibility,
      status: row.status,
      isLocked: Boolean(row.isLocked),
      acceptedAnswerId: row.acceptedAnswerId ?? null,
      likesCount: Number(row.likesCount || 0),
      repliesCount: Number(row.repliesCount || 0),
      attachments: attachments.map((a) => ({
        id: a.id,
        kind: a.kind,
        fileName: a.file_name,
        fileUrl: a.file_url,
        mimeType: a.mime_type,
        fileSize: Number(a.file_size || 0),
        ...getAttachmentDimensionFields(a.metadata),
        metadata: a.metadata
          ? typeof a.metadata === "string"
            ? JSON.parse(a.metadata)
            : a.metadata
          : null,
      })),
      isLiked,
      isBookmarked,
      isFollowing,
      isMentioned,
      isOwn,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt),
    };
  }

  const service: ThreadsService = {
    async createThread(db, input) {
      const academyId = await resolveAcademyId(db);

      // Validate course exists
      const course = await db
        .selectFrom("courses")
        .selectAll()
        .where("id", "=", input.courseId)
        .executeTakeFirst();

      if (!course) {
        throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
      }

      await courseAccess.assertCanAccessCourse(
        db,
        {
          userId: input.userId,
          roles: input.roles,
        },
        input.courseId,
      );

      const threadKind =
        input.kind === "qna" ? "question" : input.kind || "comment";

      await courseAccess.assertThreadKindEnabled(
        db,
        input.courseId,
        threadKind,
      );

      // Validate lesson hierarchy
      if (input.lessonId) {
        const lesson = await db
          .selectFrom("course_lessons")
          .selectAll()
          .where("id", "=", input.lessonId)
          .executeTakeFirst();

        if (!lesson || lesson.course_id !== input.courseId) {
          throw httpError(
            400,
            "INVALID_LESSON",
            "Lesson does not belong to this course",
          );
        }
      }

      await courseAccess.assertNotSuspended(
        db,
        input.userId,
        input.courseId,
        threadKind,
      );

      const visibility = input.visibility || "public";
      assertVisibilityAllowed(threadKind, visibility);

      const id = crypto.randomUUID();
      const plainText = extractPlainText(input.content);

      return withWriteTransaction(db, async (trx) => {
        await threadsRepo.createThread(trx, {
          id,
          academyId,
          courseId: input.courseId,
          lessonId: input.lessonId || null,
          userId: input.userId,
          kind: threadKind,
          title: input.title || null,
          content: input.content,
          plainText,
          timestampSeconds: input.timestampSeconds ?? null,
          visibility,
        });

        await syncMentionsAndNotify(trx, outbox, {
          sourceType: "thread",
          sourceId: id,
          actorUserId: input.userId,
          content: input.content,
          courseId: input.courseId,
          threadId: id,
          plainText,
        });

        // Attach any verified attachments owned by the caller
        if (input.attachmentIds && input.attachmentIds.length > 0) {
          for (const attachmentId of input.attachmentIds) {
            const attachment = await trx
              .selectFrom("learning_attachments")
              .selectAll()
              .where("id", "=", attachmentId)
              .executeTakeFirst();

            if (
              attachment &&
              attachment.owner_id === input.userId &&
              attachment.status === "ready"
            ) {
              await trx
                .updateTable("learning_attachments")
                .set({
                  target_type: "thread",
                  target_id: id,
                })
                .where("id", "=", attachmentId)
                .execute();
            }
          }
        }

        const created = await threadsRepo.findThreadById(trx, id);
        if (!created) {
          throw httpError(
            500,
            "CREATE_FAILED",
            "Failed to load created thread",
          );
        }

        const attachments = await trx
          .selectFrom("learning_attachments")
          .selectAll()
          .where("target_type", "=", "thread")
          .where("target_id", "=", id)
          .execute();

        return mapThreadRow(created, input.userId, attachments);
      });
    },

    async getThread(db, threadId, actor) {
      const row = await threadsRepo.findThreadById(db, threadId);
      if (!row) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      await courseAccess.assertCanAccessThread(db, actor, row);

      const attachments = await db
        .selectFrom("learning_attachments")
        .selectAll()
        .where("target_type", "=", "thread")
        .where("target_id", "=", threadId)
        .execute();

      let isLiked = false;
      let isBookmarked = false;
      let isFollowing = false;
      let isMentioned = false;

      const [like, bookmark, follow, threadMention, replyMention] =
        await Promise.all([
          db
            .selectFrom("learning_likes")
            .select("id")
            .where("user_id", "=", actor.userId)
            .where("target_type", "=", "thread")
            .where("target_id", "=", threadId)
            .executeTakeFirst(),
          db
            .selectFrom("learning_bookmarks")
            .select("id")
            .where("user_id", "=", actor.userId)
            .where("thread_id", "=", threadId)
            .executeTakeFirst(),
          db
            .selectFrom("learning_follows")
            .select("id")
            .where("user_id", "=", actor.userId)
            .where("thread_id", "=", threadId)
            .executeTakeFirst(),
          db
            .selectFrom("learning_mentions")
            .select("id")
            .where("mentioned_user_id", "=", actor.userId)
            .where("source_type", "=", "thread")
            .where("source_id", "=", threadId)
            .executeTakeFirst(),
          db
            .selectFrom("learning_mentions as m")
            .innerJoin("learning_replies as lr", "lr.id", "m.source_id")
            .select("m.id")
            .where("m.mentioned_user_id", "=", actor.userId)
            .where("m.source_type", "=", "reply")
            .where("lr.thread_id", "=", threadId)
            .executeTakeFirst(),
        ]);

      isLiked = Boolean(like);
      isBookmarked = Boolean(bookmark);
      isFollowing = Boolean(follow);
      isMentioned = Boolean(threadMention || replyMention);

      const mapped = mapThreadRow(row, actor.userId, attachments);
      mapped.isLiked = isLiked;
      mapped.isBookmarked = isBookmarked;
      mapped.isFollowing = isFollowing;
      mapped.isMentioned = isMentioned;

      return mapped;
    },

    async listThreads(db, query) {
      const actor: DiscussionActor = {
        userId: query.currentUserId || "",
        roles: query.roles || [],
      };
      if (query.courseId) {
        const course = await db
          .selectFrom("courses")
          .select("id")
          .where("id", "=", query.courseId)
          .executeTakeFirst();
        if (!course) {
          throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
        }
        await courseAccess.assertCanAccessCourse(db, actor, query.courseId);
      }

      const accessibleCourseIds = query.courseId
        ? undefined
        : await courseAccess.listAccessibleCourseIds(db, actor);

      if (
        accessibleCourseIds &&
        accessibleCourseIds !== "all" &&
        accessibleCourseIds.length === 0
      ) {
        return { threads: [], nextCursor: null, totalCount: 0 };
      }

      const academyId = await resolveAcademyId(db);
      const sort = normalizeThreadSort(query.sort);
      const pageCursor = decodeDiscussionCursor(query.cursor);
      if (pageCursor?.sort && pageCursor.sort !== sort) {
        throw httpError(
          400,
          "INVALID_CURSOR",
          "The pagination cursor does not match the current sort.",
        );
      }

      const listOptions = {
        ...query,
        academyId,
        pageCursor,
        ...(accessibleCourseIds && accessibleCourseIds !== "all"
          ? { accessibleCourseIds }
          : {}),
      };

      const [rows, totalCount] = await Promise.all([
        threadsRepo.listThreads(db, listOptions),
        threadsRepo.countThreads(db, listOptions),
      ]);
      const { page, hasMore } = takePage(rows, query.limit);

      let likedThreadIds = new Set<string>();
      let bookmarkedThreadIds = new Set<string>();
      let followedThreadIds = new Set<string>();
      let mentionedThreadIds = new Set<string>();
      const attachmentsByThreadId = new Map<string, LearningAttachmentRow[]>();

      if (page.length > 0) {
        const threadIds = page.map((r) => r.id);
        const [engagements, attachmentRows] = await Promise.all([
          query.currentUserId
            ? Promise.all([
                db
                  .selectFrom("learning_likes")
                  .select("target_id")
                  .where("user_id", "=", query.currentUserId)
                  .where("target_type", "=", "thread")
                  .where("target_id", "in", threadIds)
                  .execute(),
                db
                  .selectFrom("learning_bookmarks")
                  .select("thread_id")
                  .where("user_id", "=", query.currentUserId)
                  .where("thread_id", "in", threadIds)
                  .execute(),
                db
                  .selectFrom("learning_follows")
                  .select("thread_id")
                  .where("user_id", "=", query.currentUserId)
                  .where("thread_id", "in", threadIds)
                  .execute(),
                db
                  .selectFrom("learning_mentions")
                  .select("source_id")
                  .where("mentioned_user_id", "=", query.currentUserId)
                  .where("source_type", "=", "thread")
                  .where("source_id", "in", threadIds)
                  .execute(),
                db
                  .selectFrom("learning_mentions as m")
                  .innerJoin("learning_replies as lr", "lr.id", "m.source_id")
                  .select("lr.thread_id as threadId")
                  .where("m.mentioned_user_id", "=", query.currentUserId)
                  .where("m.source_type", "=", "reply")
                  .where("lr.thread_id", "in", threadIds)
                  .execute(),
              ])
            : Promise.resolve([[], [], [], [], []]),
          db
            .selectFrom("learning_attachments")
            .selectAll()
            .where("target_type", "=", "thread")
            .where("target_id", "in", threadIds)
            .where("status", "=", "ready")
            .execute(),
        ]);

        const [likes, bookmarks, follows, threadMentions, replyMentions] =
          engagements;
        likedThreadIds = new Set(likes.map((l) => l.target_id));
        bookmarkedThreadIds = new Set(
          bookmarks.flatMap((b) => (b.thread_id ? [b.thread_id] : [])),
        );
        followedThreadIds = new Set(follows.map((f) => f.thread_id));
        mentionedThreadIds = new Set([
          ...threadMentions.map((m) => m.source_id),
          ...replyMentions.map((m) => m.threadId),
        ]);

        for (const attachment of attachmentRows) {
          const targetId = attachment.target_id;
          if (!targetId) continue;
          const group = attachmentsByThreadId.get(targetId) ?? [];
          group.push(attachment);
          attachmentsByThreadId.set(targetId, group);
        }
      }

      const threads = page.map((row) =>
        mapThreadRow(
          row,
          query.currentUserId,
          attachmentsByThreadId.get(row.id) ?? [],
          {
            likedThreadIds,
            bookmarkedThreadIds,
            followedThreadIds,
            mentionedThreadIds,
          },
        ),
      );

      const last = page.at(-1);
      let nextCursor: string | null = null;
      if (hasMore && last) {
        nextCursor = encodeDiscussionCursor({
          id: last.id,
          createdAt: toDate(last.createdAt),
          sort,
          updatedAt: last.updatedAt ? toDate(last.updatedAt) : undefined,
          repliesCount: Number(last.repliesCount || 0),
          engagement:
            Number(last.likesCount || 0) + Number(last.repliesCount || 0),
        });
      }

      return {
        threads,
        nextCursor,
        totalCount,
      };
    },

    async updateThread(db, threadId, actor, updates) {
      return withWriteTransaction(db, async (trx) => {
        const row = await threadsRepo.findThreadById(trx, threadId);
        if (!row) {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }

        await courseAccess.assertCanAccessThread(trx, actor, row);
        courseAccess.assertThreadIsActive(row);

        if (row.userId !== actor.userId) {
          throw httpError(
            403,
            "FORBIDDEN",
            "You are only allowed to edit your own discussion threads",
          );
        }

        if (row.isLocked) {
          throw httpError(
            400,
            "THREAD_LOCKED",
            "Cannot edit locked discussion thread",
          );
        }

        if (updates.visibility) {
          assertVisibilityAllowed(row.kind, updates.visibility);
        }

        const plainText = updates.content
          ? extractPlainText(updates.content)
          : undefined;

        await threadsRepo.updateThread(trx, threadId, {
          ...updates,
          plainText,
        });

        if (updates.content) {
          await syncMentionsAndNotify(trx, outbox, {
            sourceType: "thread",
            sourceId: threadId,
            actorUserId: actor.userId,
            content: updates.content,
            courseId: row.courseId,
            threadId,
            plainText,
          });
        }

        const updated = await threadsRepo.findThreadById(trx, threadId);
        if (!updated) {
          throw httpError(
            500,
            "UPDATE_FAILED",
            "Failed to load updated discussion thread",
          );
        }
        return mapThreadRow(updated, actor.userId);
      });
    },

    async deleteThread(db, threadId, actor) {
      const row = await threadsRepo.findThreadById(db, threadId);
      if (!row) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      await courseAccess.assertCanAccessThread(db, actor, row);
      courseAccess.assertThreadIsActive(row);

      const canStaffModerate = await courseAccess.canModerateCourse(
        db,
        actor,
        row.courseId,
      );
      if (row.userId !== actor.userId && !canStaffModerate) {
        throw httpError(
          403,
          "FORBIDDEN",
          "You are not allowed to delete this discussion thread",
        );
      }

      await withWriteTransaction(db, async (trx) => {
        await threadsRepo.deleteThread(trx, threadId);
      });
    },

    async getDiscussionsWorkspace(db, query) {
      const actor: DiscussionActor = {
        userId: query.currentUserId || "",
        roles: query.roles || [],
      };
      const isStaff = actor.roles.some((r) =>
        ["admin", "instructor", "creator", "staff"].includes(r.toLowerCase()),
      );

      // Validate courseId if supplied
      if (query.courseId) {
        const course = await db
          .selectFrom("courses")
          .select("id")
          .where("id", "=", query.courseId)
          .where("deleted_at", "is", null)
          .executeTakeFirst();
        if (!course) {
          throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
        }
        await courseAccess.assertCanAccessCourse(db, actor, query.courseId);
      }

      // Determine accessible courses for student / staff
      const accessibleCourseIds = isStaff
        ? "all"
        : await courseAccess.listAccessibleCourseIds(db, actor);

      if (accessibleCourseIds !== "all" && accessibleCourseIds.length === 0) {
        return { items: [], courses: [], nextCursor: null, totalCount: 0 };
      }

      // Fetch available courses list for the dropdown
      let coursesQuery = db
        .selectFrom("courses")
        .select(["id", "title", "slug"])
        .where("status", "=", "published")
        .where("deleted_at", "is", null);

      if (accessibleCourseIds !== "all") {
        coursesQuery = coursesQuery.where("id", "in", [...accessibleCourseIds]);
      }

      const coursesRows = await coursesQuery.orderBy("title", "asc").execute();
      const courses = coursesRows.map((c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug ?? undefined,
      }));

      const academyId = await resolveAcademyId(db);
      const tab = query.tab || "q-and-a";
      const limit = query.limit || 20;
      const sort = normalizeThreadSort(query.sort);
      const pageCursor = decodeDiscussionCursor(query.cursor);

      // Tab: Notes
      if (tab === "notes") {
        let notesQuery = db
          .selectFrom("learning_notes as n")
          .innerJoin("users as u", "u.id", "n.user_id")
          .innerJoin("courses as c", "c.id", "n.course_id")
          .innerJoin("course_lessons as l", "l.id", "n.lesson_id")
          .select([
            "n.id",
            "n.user_id as userId",
            "u.display_name as authorName",
            "u.username as authorUsername",
            "u.avatar_data_url as authorAvatarUrl",
            authorRoleSql("n.user_id"),
            "n.course_id as courseId",
            "c.title as courseTitle",
            "n.lesson_id as lessonId",
            "l.title as lessonTitle",
            "n.timestamp_seconds as timestampSeconds",
            "n.title",
            "n.content",
            "n.plain_text as plainText",
            "n.visibility",
            "n.likes_count as likesCount",
            "n.created_at as createdAt",
            "n.updated_at as updatedAt",
          ]);

        let notesCountQuery = db
          .selectFrom("learning_notes as n")
          .select(sql<number>`count(*)::int`.as("count"));

        if (query.courseId) {
          notesQuery = notesQuery.where("n.course_id", "=", query.courseId);
          notesCountQuery = notesCountQuery.where(
            "n.course_id",
            "=",
            query.courseId,
          );
        } else if (accessibleCourseIds !== "all") {
          notesQuery = notesQuery.where("n.course_id", "in", [
            ...accessibleCourseIds,
          ]);
          notesCountQuery = notesCountQuery.where("n.course_id", "in", [
            ...accessibleCourseIds,
          ]);
        }

        if (query.lessonId) {
          notesQuery = notesQuery.where("n.lesson_id", "=", query.lessonId);
          notesCountQuery = notesCountQuery.where(
            "n.lesson_id",
            "=",
            query.lessonId,
          );
        }

        if (!isStaff) {
          // Student only sees their own notes
          notesQuery = notesQuery.where("n.user_id", "=", actor.userId);
          notesCountQuery = notesCountQuery.where(
            "n.user_id",
            "=",
            actor.userId,
          );
        } else if (query.mine) {
          notesQuery = notesQuery.where("n.user_id", "=", actor.userId);
          notesCountQuery = notesCountQuery.where(
            "n.user_id",
            "=",
            actor.userId,
          );
        }

        if (query.search) {
          const pattern = `%${query.search.toLowerCase()}%`;
          notesQuery = notesQuery.where((eb) =>
            eb.or([
              eb(sql`lower(n.title)`, "like", pattern),
              eb(sql`lower(n.plain_text)`, "like", pattern),
            ]),
          );
          notesCountQuery = notesCountQuery.where((eb) =>
            eb.or([
              eb(sql`lower(n.title)`, "like", pattern),
              eb(sql`lower(n.plain_text)`, "like", pattern),
            ]),
          );
        }

        if (pageCursor) {
          notesQuery = notesQuery.where(createdAtIdDescSql("n", pageCursor));
        }

        notesQuery = notesQuery
          .orderBy("n.created_at", "desc")
          .orderBy("n.id", "desc")
          .limit(limit + 1);

        const [noteRows, countRow] = await Promise.all([
          notesQuery.execute(),
          notesCountQuery.executeTakeFirst(),
        ]);

        const { page, hasMore } = takePage(noteRows, limit);
        const totalCount = Number(countRow?.count ?? 0);

        let likedNoteIds = new Set<string>();
        let bookmarkedNoteIds = new Set<string>();

        if (page.length > 0 && actor.userId) {
          const noteIds = page.map((n) => n.id);
          const [likes, bookmarks] = await Promise.all([
            db
              .selectFrom("learning_likes")
              .select("target_id")
              .where("user_id", "=", actor.userId)
              .where("target_type", "=", "note")
              .where("target_id", "in", noteIds)
              .execute(),
            db
              .selectFrom("learning_bookmarks")
              .select("note_id")
              .where("user_id", "=", actor.userId)
              .where("note_id", "in", noteIds)
              .execute(),
          ]);
          likedNoteIds = new Set(likes.map((l) => l.target_id));
          bookmarkedNoteIds = new Set(
            bookmarks.flatMap((b) => (b.note_id ? [b.note_id] : [])),
          );
        }

        const items: WorkspaceDiscussionItem[] = page.map((row) => ({
          id: row.id,
          itemType: "note",
          kind: "note",
          title: row.title ?? null,
          content: row.content,
          plainText: row.plainText,
          courseId: row.courseId,
          courseTitle: row.courseTitle ?? null,
          lessonId: row.lessonId ?? null,
          lessonTitle: row.lessonTitle ?? null,
          timestampSeconds: row.timestampSeconds ?? null,
          author: {
            id: row.userId,
            displayName: row.authorName || "Anonymous Learner",
            username: row.authorUsername || `user-${row.userId.slice(0, 8)}`,
            avatarUrl: row.authorAvatarUrl,
            role: mapAuthorRole(row.authorRole),
          },
          repliesCount: 0,
          likesCount: Number(row.likesCount || 0),
          isLiked: likedNoteIds.has(row.id),
          isBookmarked: bookmarkedNoteIds.has(row.id),
          isFollowing: false,
          isMentioned: false,
          isOwn: row.userId === actor.userId,
          attachmentSummary: emptyAttachmentSummary(),
          createdAt:
            row.createdAt instanceof Date
              ? row.createdAt.toISOString()
              : String(row.createdAt),
          updatedAt:
            row.updatedAt instanceof Date
              ? row.updatedAt.toISOString()
              : String(row.updatedAt),
        }));

        let nextCursor: string | null = null;
        const last = page.at(-1);
        if (hasMore && last) {
          nextCursor = encodeDiscussionCursor({
            id: last.id,
            createdAt: toDate(last.createdAt),
          });
        }

        return {
          items,
          courses,
          nextCursor,
          totalCount,
        };
      }

      // Tab: Reports (Staff / Admin only)
      if (tab === "reports") {
        if (!isStaff) {
          throw httpError(
            403,
            "FORBIDDEN",
            "Only staff and administrators can view moderation reports.",
          );
        }

        let reportsQuery = db
          .selectFrom("learning_reports as rep")
          .innerJoin("users as u", "u.id", "rep.reporter_id")
          .leftJoin("courses as c", "c.id", "rep.course_id")
          .select([
            "rep.id as id",
            "rep.reporter_id as reporterId",
            "rep.target_type as targetType",
            "rep.target_id as targetId",
            "rep.course_id as courseId",
            "c.title as courseTitle",
            "rep.reason as reason",
            "rep.details as details",
            "rep.status as status",
            "rep.action_taken as actionTaken",
            "rep.created_at as createdAt",
            "rep.updated_at as updatedAt",
            "u.display_name as reporterName",
            "u.username as reporterUsername",
            "u.avatar_data_url as reporterAvatarUrl",
            authorRoleSql("rep.reporter_id"),
          ]);

        let reportsCountQuery = db
          .selectFrom("learning_reports as rep")
          .select(sql<number>`count(*)::int`.as("count"));

        if (query.courseId) {
          reportsQuery = reportsQuery.where(
            "rep.course_id",
            "=",
            query.courseId,
          );
          reportsCountQuery = reportsCountQuery.where(
            "rep.course_id",
            "=",
            query.courseId,
          );
        }

        if (query.search) {
          const pattern = `%${query.search.toLowerCase()}%`;
          reportsQuery = reportsQuery.where((eb) =>
            eb.or([
              eb(sql`lower(rep.reason)`, "like", pattern),
              eb(sql`lower(rep.details)`, "like", pattern),
            ]),
          );
          reportsCountQuery = reportsCountQuery.where((eb) =>
            eb.or([
              eb(sql`lower(rep.reason)`, "like", pattern),
              eb(sql`lower(rep.details)`, "like", pattern),
            ]),
          );
        }

        if (pageCursor) {
          reportsQuery = reportsQuery.where(
            createdAtIdDescSql("rep", pageCursor),
          );
        }

        reportsQuery = reportsQuery
          .orderBy("rep.created_at", "desc")
          .orderBy("rep.id", "desc")
          .limit(limit + 1);

        const [reportRows, countRow] = await Promise.all([
          reportsQuery.execute(),
          reportsCountQuery.executeTakeFirst(),
        ]);

        const { page, hasMore } = takePage(reportRows, limit);
        const totalCount = Number(countRow?.count ?? 0);
        const fallbackCourseId =
          courses[0]?.id || "00000000-0000-0000-0000-000000000000";

        const items: WorkspaceDiscussionItem[] = page.map((row) => ({
          id: row.id,
          itemType: "report",
          kind: "comment",
          title: `Report: ${row.reason}`,
          content: row.details || row.reason,
          plainText: row.details || row.reason,
          courseId: row.courseId || fallbackCourseId,
          courseTitle: row.courseTitle ?? null,
          lessonId: null,
          lessonTitle: null,
          timestampSeconds: null,
          author: {
            id: row.reporterId,
            displayName: row.reporterName || "Anonymous Reporter",
            username:
              row.reporterUsername || `user-${row.reporterId.slice(0, 8)}`,
            avatarUrl: row.reporterAvatarUrl,
            role: mapAuthorRole(row.authorRole),
          },
          repliesCount: 0,
          likesCount: 0,
          isLiked: false,
          isBookmarked: false,
          isFollowing: false,
          isMentioned: false,
          isOwn: row.reporterId === actor.userId,
          attachmentSummary: emptyAttachmentSummary(),
          reportDetails: {
            targetType: row.targetType as "thread" | "reply" | "note",
            targetId: row.targetId,
            reason: row.reason,
            details: row.details ?? undefined,
            status: row.status as
              "pending" | "reviewed" | "dismissed" | "actioned",
            actionTaken: row.actionTaken ?? undefined,
          },
          createdAt:
            row.createdAt instanceof Date
              ? row.createdAt.toISOString()
              : String(row.createdAt),
          updatedAt:
            row.updatedAt instanceof Date
              ? row.updatedAt.toISOString()
              : String(row.updatedAt),
        }));

        let nextCursor: string | null = null;
        const last = page.at(-1);
        if (hasMore && last) {
          nextCursor = encodeDiscussionCursor({
            id: last.id,
            createdAt: toDate(last.createdAt),
          });
        }

        return {
          items,
          courses,
          nextCursor,
          totalCount,
        };
      }

      // Tab: Saved (handles both saved threads and saved notes)
      if (tab === "saved") {
        const threadOptions = {
          ...query,
          tab: "saved" as const,
          academyId,
          currentUserId: actor.userId,
          pageCursor,
          ...(accessibleCourseIds !== "all" ? { accessibleCourseIds } : {}),
        };

        const [threadRows, totalCount] = await Promise.all([
          threadsRepo.listThreads(db, threadOptions),
          threadsRepo.countThreads(db, threadOptions),
        ]);

        const { page, hasMore } = takePage(threadRows, limit);

        let likedThreadIds = new Set<string>();
        let followedThreadIds = new Set<string>();
        let mentionedThreadIds = new Set<string>();
        let attachmentSummariesByThreadId = new Map<
          string,
          DiscussionAttachmentSummary
        >();

        if (page.length > 0) {
          const threadIds = page.map((r) => r.id);
          const [engagements, attachmentSummaryRows] = await Promise.all([
            actor.userId
              ? Promise.all([
                  db
                    .selectFrom("learning_likes")
                    .select("target_id")
                    .where("user_id", "=", actor.userId)
                    .where("target_type", "=", "thread")
                    .where("target_id", "in", threadIds)
                    .execute(),
                  db
                    .selectFrom("learning_follows")
                    .select("thread_id")
                    .where("user_id", "=", actor.userId)
                    .where("thread_id", "in", threadIds)
                    .execute(),
                  db
                    .selectFrom("learning_mentions")
                    .select("source_id")
                    .where("mentioned_user_id", "=", actor.userId)
                    .where("source_type", "=", "thread")
                    .where("source_id", "in", threadIds)
                    .execute(),
                  db
                    .selectFrom("learning_mentions as m")
                    .innerJoin("learning_replies as lr", "lr.id", "m.source_id")
                    .select("lr.thread_id as threadId")
                    .where("m.mentioned_user_id", "=", actor.userId)
                    .where("m.source_type", "=", "reply")
                    .where("lr.thread_id", "in", threadIds)
                    .execute(),
                ])
              : Promise.resolve([[], [], [], []]),
            attachmentsRepo.listThreadAttachmentSummaries(db, threadIds),
          ]);

          const [likes, follows, threadMentions, replyMentions] = engagements;

          likedThreadIds = new Set(likes.map((l) => l.target_id));
          followedThreadIds = new Set(follows.map((f) => f.thread_id));
          mentionedThreadIds = new Set([
            ...threadMentions.map((m) => m.source_id),
            ...replyMentions.map((m) => m.threadId),
          ]);
          attachmentSummariesByThreadId = indexAttachmentSummaries(
            attachmentSummaryRows,
          );
        }

        const items: WorkspaceDiscussionItem[] = page.map((row) => {
          const isQna = row.kind === "question" || row.kind === "qna";
          const statusVal: QuestionFilterStatus | undefined = isQna
            ? row.acceptedAnswerId
              ? "solved"
              : Number(row.repliesCount || 0) > 0
                ? "answered"
                : "open"
            : undefined;

          return {
            id: row.id,
            itemType: "thread",
            kind: row.kind,
            title: row.title ?? null,
            content: row.content,
            plainText: row.plainText,
            courseId: row.courseId,
            courseTitle: row.courseTitle ?? null,
            lessonId: row.lessonId ?? null,
            lessonTitle: row.lessonTitle ?? null,
            timestampSeconds: row.timestampSeconds ?? null,
            author: {
              id: row.userId,
              displayName: row.authorName || "Anonymous Learner",
              username: row.authorUsername || `user-${row.userId.slice(0, 8)}`,
              avatarUrl: row.authorAvatarUrl,
              role: mapAuthorRole(row.authorRole),
            },
            status: statusVal,
            repliesCount: Number(row.repliesCount || 0),
            likesCount: Number(row.likesCount || 0),
            isLiked: likedThreadIds.has(row.id),
            isBookmarked: true,
            isFollowing: followedThreadIds.has(row.id),
            isMentioned: mentionedThreadIds.has(row.id),
            isOwn: row.userId === actor.userId,
            attachmentSummary:
              attachmentSummariesByThreadId.get(row.id) ??
              emptyAttachmentSummary(),
            createdAt:
              row.createdAt instanceof Date
                ? row.createdAt.toISOString()
                : String(row.createdAt),
            updatedAt:
              row.updatedAt instanceof Date
                ? row.updatedAt.toISOString()
                : String(row.updatedAt),
          };
        });

        let nextCursor: string | null = null;
        const last = page.at(-1);
        if (hasMore && last) {
          nextCursor = encodeDiscussionCursor({
            id: last.id,
            createdAt: toDate(last.createdAt),
            sort,
            updatedAt: last.updatedAt ? toDate(last.updatedAt) : undefined,
            repliesCount: Number(last.repliesCount || 0),
            engagement:
              Number(last.likesCount || 0) + Number(last.repliesCount || 0),
          });
        }

        return {
          items,
          courses,
          nextCursor,
          totalCount,
        };
      }

      // Other tabs: "comments", "q-and-a", "mentions", "following", "all"
      // Apply role-based rules:
      // - For students on comments & q-and-a: only what the student has created (mine = true)
      // - Status filter is ONLY applicable to "q-and-a" tab
      const effectiveStatus = tab === "q-and-a" ? query.status : "all";
      const isStudentTab =
        !isStaff && (tab === "comments" || tab === "q-and-a");

      const threadOptions = {
        ...query,
        tab,
        status: effectiveStatus,
        mine: isStudentTab ? true : query.mine,
        academyId,
        currentUserId: actor.userId,
        pageCursor,
        ...(accessibleCourseIds !== "all" ? { accessibleCourseIds } : {}),
      };

      const [threadRows, totalCount] = await Promise.all([
        threadsRepo.listThreads(db, threadOptions),
        threadsRepo.countThreads(db, threadOptions),
      ]);

      const { page, hasMore } = takePage(threadRows, limit);

      let likedThreadIds = new Set<string>();
      let bookmarkedThreadIds = new Set<string>();
      let followedThreadIds = new Set<string>();
      let mentionedThreadIds = new Set<string>();
      let attachmentSummariesByThreadId = new Map<
        string,
        DiscussionAttachmentSummary
      >();

      if (page.length > 0) {
        const threadIds = page.map((r) => r.id);
        const [engagements, attachmentSummaryRows] = await Promise.all([
          actor.userId
            ? Promise.all([
                db
                  .selectFrom("learning_likes")
                  .select("target_id")
                  .where("user_id", "=", actor.userId)
                  .where("target_type", "=", "thread")
                  .where("target_id", "in", threadIds)
                  .execute(),
                db
                  .selectFrom("learning_bookmarks")
                  .select("thread_id")
                  .where("user_id", "=", actor.userId)
                  .where("thread_id", "in", threadIds)
                  .execute(),
                db
                  .selectFrom("learning_follows")
                  .select("thread_id")
                  .where("user_id", "=", actor.userId)
                  .where("thread_id", "in", threadIds)
                  .execute(),
                db
                  .selectFrom("learning_mentions")
                  .select("source_id")
                  .where("mentioned_user_id", "=", actor.userId)
                  .where("source_type", "=", "thread")
                  .where("source_id", "in", threadIds)
                  .execute(),
                db
                  .selectFrom("learning_mentions as m")
                  .innerJoin("learning_replies as lr", "lr.id", "m.source_id")
                  .select("lr.thread_id as threadId")
                  .where("m.mentioned_user_id", "=", actor.userId)
                  .where("m.source_type", "=", "reply")
                  .where("lr.thread_id", "in", threadIds)
                  .execute(),
              ])
            : Promise.resolve([[], [], [], [], []]),
          attachmentsRepo.listThreadAttachmentSummaries(db, threadIds),
        ]);

        const [likes, bookmarks, follows, threadMentions, replyMentions] =
          engagements;

        likedThreadIds = new Set(likes.map((l) => l.target_id));
        bookmarkedThreadIds = new Set(
          bookmarks.flatMap((b) => (b.thread_id ? [b.thread_id] : [])),
        );
        followedThreadIds = new Set(follows.map((f) => f.thread_id));
        mentionedThreadIds = new Set([
          ...threadMentions.map((m) => m.source_id),
          ...replyMentions.map((m) => m.threadId),
        ]);
        attachmentSummariesByThreadId = indexAttachmentSummaries(
          attachmentSummaryRows,
        );
      }

      const items: WorkspaceDiscussionItem[] = page.map((row) => {
        const isQna = row.kind === "question" || row.kind === "qna";
        const statusVal: QuestionFilterStatus | undefined = isQna
          ? row.acceptedAnswerId
            ? "solved"
            : Number(row.repliesCount || 0) > 0
              ? "answered"
              : "open"
          : undefined;

        return {
          id: row.id,
          itemType: "thread",
          kind: row.kind,
          title: row.title ?? null,
          content: row.content,
          plainText: row.plainText,
          courseId: row.courseId,
          courseTitle: row.courseTitle ?? null,
          lessonId: row.lessonId ?? null,
          lessonTitle: row.lessonTitle ?? null,
          timestampSeconds: row.timestampSeconds ?? null,
          author: {
            id: row.userId,
            displayName: row.authorName || "Anonymous Learner",
            username: row.authorUsername || `user-${row.userId.slice(0, 8)}`,
            avatarUrl: row.authorAvatarUrl,
            role: mapAuthorRole(row.authorRole),
          },
          status: statusVal,
          repliesCount: Number(row.repliesCount || 0),
          likesCount: Number(row.likesCount || 0),
          isLiked: likedThreadIds.has(row.id),
          isBookmarked: bookmarkedThreadIds.has(row.id),
          isFollowing: followedThreadIds.has(row.id),
          isMentioned: tab === "mentions" || mentionedThreadIds.has(row.id),
          isOwn: row.userId === actor.userId,
          attachmentSummary:
            attachmentSummariesByThreadId.get(row.id) ??
            emptyAttachmentSummary(),
          createdAt:
            row.createdAt instanceof Date
              ? row.createdAt.toISOString()
              : String(row.createdAt),
          updatedAt:
            row.updatedAt instanceof Date
              ? row.updatedAt.toISOString()
              : String(row.updatedAt),
        };
      });

      let nextCursor: string | null = null;
      const last = page.at(-1);
      if (hasMore && last) {
        nextCursor = encodeDiscussionCursor({
          id: last.id,
          createdAt: toDate(last.createdAt),
          sort,
          updatedAt: last.updatedAt ? toDate(last.updatedAt) : undefined,
          repliesCount: Number(last.repliesCount || 0),
          engagement:
            Number(last.likesCount || 0) + Number(last.repliesCount || 0),
        });
      }

      return {
        items,
        courses,
        nextCursor,
        totalCount,
      };
    },
  };

  return service;
}
