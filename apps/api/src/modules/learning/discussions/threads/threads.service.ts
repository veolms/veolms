import type { DatabaseExecutor, LearningAttachmentTable } from "@veolms/database";
import type { Selectable } from "kysely";
import type {
  CreateLearningThreadRequest,
  LearningThread,
  LearningThreadsListResponse,
  ListLearningThreadsQuery,
  UpdateLearningThreadRequest,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import {
  createDiscussionOutbox,
  syncMentionsAndNotify,
  withWriteTransaction,
} from "../shared/discussion.mentions.ts";
import {
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
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import type { ThreadsRepository, ThreadRowWithAuthor } from "./threads.repository.ts";

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
}

export function createThreadsService(
  threadsRepo: ThreadsRepository,
): ThreadsService {
  const outbox = createDiscussionOutbox();
  const courseAccess = createDiscussionAccess();

  function mapThreadRow(
    row: ThreadRowWithAuthor,
    currentUserId?: string,
    attachments: LearningAttachmentRow[] = [],
    engagements?: {
      likedThreadIds?: Set<string>;
      bookmarkedThreadIds?: Set<string>;
      followedThreadIds?: Set<string>;
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

    return {
      id: row.id,
      academyId: row.academyId,
      courseId: row.courseId,
      lessonId: row.lessonId ?? null,
      userId: row.userId,
      author: {
        id: row.userId,
        displayName: row.authorName || "Anonymous Learner",
        username: row.authorUsername || `user-${row.userId.slice(0, 8)}`,
        avatarUrl: null,
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
        metadata: a.metadata
          ? typeof a.metadata === "string"
            ? JSON.parse(a.metadata)
            : a.metadata
          : null,
      })),
      isLiked,
      isBookmarked,
      isFollowing,
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

  return {
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

      const threadKind =
        input.kind === "qna" ? "question" : input.kind || "comment";
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

      const [like, bookmark, follow] = await Promise.all([
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
      ]);

      isLiked = Boolean(like);
      isBookmarked = Boolean(bookmark);
      isFollowing = Boolean(follow);

      const mapped = mapThreadRow(row, actor.userId, attachments);
      mapped.isLiked = isLiked;
      mapped.isBookmarked = isBookmarked;
      mapped.isFollowing = isFollowing;

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

      if (query.currentUserId && page.length > 0) {
        const threadIds = page.map((r) => r.id);
        const [likes, bookmarks, follows] = await Promise.all([
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
        ]);

        likedThreadIds = new Set(likes.map((l) => l.target_id));
        bookmarkedThreadIds = new Set(bookmarks.map((b) => b.thread_id));
        followedThreadIds = new Set(follows.map((f) => f.thread_id));
      }

      const threads = page.map((row) =>
        mapThreadRow(row, query.currentUserId, [], {
          likedThreadIds,
          bookmarkedThreadIds,
          followedThreadIds,
        }),
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
            "You are not allowed to update this discussion thread",
          );
        }

        courseAccess.assertThreadNotLocked(row);
        await courseAccess.assertNotSuspended(
          trx,
          actor.userId,
          row.courseId,
          row.kind,
        );
        assertVisibilityAllowed(row.kind, updates.visibility);

        const plainText = updates.content
          ? extractPlainText(updates.content)
          : undefined;
        await threadsRepo.updateThread(trx, threadId, {
          ...updates,
          ...(plainText ? { plainText } : {}),
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
        await trx
          .updateTable("learning_attachments")
          .set({ status: "deleted" })
          .where("target_type", "=", "thread")
          .where("target_id", "=", threadId)
          .execute();
      });
    },
  };
}
