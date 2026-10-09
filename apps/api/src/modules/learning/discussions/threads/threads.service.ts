import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";
import type {
  CreateLearningThreadRequest,
  DiscussionAttachmentSummary,
  DiscussionsWorkspaceResponse,
  LearningThread,
  LearningThreadEditResponse,
  LearningThreadsListResponse,
  ListLearningThreadsQuery,
  PublicPopularDiscussionsResponse,
  UpdateLearningThreadRequest,
  WorkspaceDiscussionItem,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import { clampText } from "../../../../lib/text.ts";
import { avatarSrcSetFromUrl } from "../../../avatars/index.ts";
import { DiscussionErrors } from "../shared/discussion.errors.ts";
import {
  createDiscussionOutbox,
  syncMentionsAndNotify,
  withWriteTransaction,
} from "../shared/discussion.mentions.ts";
import {
  createdAtIdDescSql,
  decodeDiscussionCursor,
  encodeDiscussionCursor,
  extractPlainText,
  normalizeThreadSort,
  resolveAcademyId,
  takePage,
  toDate,
  updatedAtIdDescSql,
} from "../shared/discussion.utils.ts";
import {
  presentDiscussionAuthor,
  presentWorkspaceAuthor,
  threadQaStatus,
  toIsoString,
} from "../shared/discussion.presenters.ts";
import {
  listReadyAttachments,
  presentDiscussionAttachment,
  type DiscussionAttachmentRow,
} from "../shared/discussion-attachments.ts";
import {
  createDiscussionAccess,
  type DiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import {
  createLessonDiscussionAccess,
  type LessonDiscussionAccess,
} from "../shared/lesson-discussion-access.ts";
import type {
  PublicPopularThreadRow,
  ThreadsRepository,
  ThreadRowWithAuthor,
} from "./threads.repository.ts";
import {
  BOOKMARKS_WORKSPACE_SORT,
  createBookmarksRepository,
  type BookmarkWorkspaceRow,
  type BookmarksRepository,
} from "../bookmarks/bookmarks.repository.ts";
import type {
  AttachmentsRepository,
  AttachmentSummaryRow,
} from "../attachments/attachments.repository.ts";
import type { S3StorageService } from "@veolms/storage";

const MENTIONS_WORKSPACE_SORT = "mentions";

export type ThreadsListQuery = ListLearningThreadsQuery & {
  currentUserId?: string;
  roles?: readonly string[];
  ids?: readonly string[];
  /** Internal lesson-feed call after lesson-level read authorization. */
  skipCourseAccessCheck?: boolean;
};

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
    actor: DiscussionActor | null,
  ): Promise<LearningThread>;

  listThreads(
    db: DatabaseExecutor,
    query: ThreadsListQuery,
  ): Promise<LearningThreadsListResponse>;

  updateThread(
    db: DatabaseExecutor,
    threadId: string,
    actor: DiscussionActor,
    updates: UpdateLearningThreadRequest,
  ): Promise<LearningThreadEditResponse>;

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

  listPublicPopularDiscussions(
    db: DatabaseExecutor,
    options?: {
      /** At most 40; 20 when left out. */
      limit?: number;
      /** Keep only each author's most popular discussion. */
      onePerAuthor?: boolean;
    },
  ): Promise<PublicPopularDiscussionsResponse>;
}

export function createThreadsService(
  threadsRepo: ThreadsRepository,
  attachmentsRepo: AttachmentsRepository,
  courseAccess: DiscussionAccess = createDiscussionAccess(),
  bookmarksRepo: BookmarksRepository = createBookmarksRepository(),
  lessonAccess: LessonDiscussionAccess = createLessonDiscussionAccess(),
  storage?: S3StorageService,
): ThreadsService {
  const outbox = createDiscussionOutbox();

  const emptyAttachmentSummary = (): DiscussionAttachmentSummary => ({
    count: 0,
    hasImages: false,
    hasVideos: false,
    hasFiles: false,
  });

  const indexAttachmentSummaries = (
    summaries: readonly AttachmentSummaryRow[],
  ): Map<string, DiscussionAttachmentSummary> =>
    new Map(
      summaries.map((summary) => [summary.targetId, summary.attachmentSummary]),
    );

  // What the viewer has done with the threads on a page. Each read is one
  // indexed lookup by (user, thread ids); an anonymous viewer has none.
  async function listLikedThreadIds(
    db: DatabaseExecutor,
    userId: string | null | undefined,
    threadIds: readonly string[],
  ): Promise<Set<string>> {
    if (!userId || threadIds.length === 0) return new Set();
    const rows = await db
      .selectFrom("learning_likes")
      .select("target_id")
      .where("user_id", "=", userId)
      .where("target_type", "=", "thread")
      .where("target_id", "in", [...threadIds])
      .execute();
    return new Set(rows.map((row) => row.target_id));
  }

  async function listBookmarkedThreadIds(
    db: DatabaseExecutor,
    userId: string | null | undefined,
    threadIds: readonly string[],
  ): Promise<Set<string>> {
    if (!userId || threadIds.length === 0) return new Set();
    const rows = await db
      .selectFrom("learning_bookmarks")
      .select("thread_id")
      .where("user_id", "=", userId)
      .where("thread_id", "in", [...threadIds])
      .execute();
    return new Set(
      rows.flatMap((row) => (row.thread_id ? [row.thread_id] : [])),
    );
  }

  async function listFollowedThreadIds(
    db: DatabaseExecutor,
    userId: string | null | undefined,
    threadIds: readonly string[],
  ): Promise<Set<string>> {
    if (!userId || threadIds.length === 0) return new Set();
    const rows = await db
      .selectFrom("learning_follows")
      .select("thread_id")
      .where("user_id", "=", userId)
      .where("thread_id", "in", [...threadIds])
      .execute();
    return new Set(rows.map((row) => row.thread_id));
  }

  async function listBookmarkedNoteIds(
    db: DatabaseExecutor,
    userId: string | null | undefined,
    noteIds: readonly string[],
  ): Promise<Set<string>> {
    if (!userId || noteIds.length === 0) return new Set();
    const rows = await db
      .selectFrom("learning_bookmarks")
      .select("note_id")
      .where("user_id", "=", userId)
      .where("note_id", "in", [...noteIds])
      .execute();
    return new Set(rows.flatMap((row) => (row.note_id ? [row.note_id] : [])));
  }

  function mapBookmarkWorkspaceItem(
    row: BookmarkWorkspaceRow,
    attachmentSummary: DiscussionAttachmentSummary,
    followedThreadIds: Set<string>,
    currentUserId: string,
  ): WorkspaceDiscussionItem {
    const isThread = row.itemType === "thread";

    const item: WorkspaceDiscussionItem = {
      id: row.id,
      itemType: row.itemType,
      kind: row.kind,
      title: row.title ?? null,
      content: row.content,
      plainText: row.plainText,
      courseId: row.courseId,
      courseTitle: row.courseTitle ?? null,
      lessonId: row.lessonId ?? null,
      lessonTitle: row.lessonTitle ?? null,
      timestampSeconds: row.timestampSeconds ?? null,
      author: presentWorkspaceAuthor(row),
      visibility: row.visibility,
      repliesCount: isThread ? Number(row.repliesCount || 0) : 0,
      likesCount: Number(row.likesCount || 0),
      isBookmarked: true,
      isOwn: row.userId === currentUserId,
      attachmentSummary,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
      bookmarkedAt: toIsoString(row.bookmarkedAt),
    };

    if (isThread) {
      item.status = threadQaStatus(row);
      item.isLocked = Boolean(row.isLocked);
      item.isFollowing = followedThreadIds.has(row.id);
    }

    return item;
  }

  const normalizeNotesWorkspaceSort = (
    sort: ListLearningThreadsQuery["sort"] | undefined,
  ): "latest" | "activity" => (sort === "activity" ? "activity" : "latest");

  function mapThreadRow(
    row: ThreadRowWithAuthor,
    currentUserId?: string | null,
    attachments: DiscussionAttachmentRow[] = [],
    viewer?: {
      likedThreadIds: Set<string>;
      bookmarkedThreadIds: Set<string>;
      followedThreadIds: Set<string>;
    },
  ): LearningThread {
    return {
      id: row.id,
      courseId: row.courseId,
      lessonId: row.lessonId ?? null,
      author: presentDiscussionAuthor(row),
      kind: row.kind,
      title: row.title ?? null,
      content: row.content,
      plainText: row.plainText,
      timestampSeconds: row.timestampSeconds ?? null,
      visibility: row.visibility,
      isLocked: Boolean(row.isLocked),
      acceptedAnswerId: row.acceptedAnswerId ?? null,
      likesCount: Number(row.likesCount || 0),
      repliesCount: Number(row.repliesCount || 0),
      attachments: attachments.map((attachment) =>
        presentDiscussionAttachment(attachment, storage),
      ),
      isLiked: viewer?.likedThreadIds.has(row.id) ?? false,
      isBookmarked: viewer?.bookmarkedThreadIds.has(row.id) ?? false,
      isFollowing: viewer?.followedThreadIds.has(row.id) ?? false,
      isOwn: currentUserId ? row.userId === currentUserId : false,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    };
  }

  const service: ThreadsService = {
    async createThread(db, input) {
      const academyId = await resolveAcademyId(db);

      // Validate course exists
      const course = await db
        .selectFrom("courses")
        .select("id")
        .where("id", "=", input.courseId)
        .executeTakeFirst();

      if (!course) {
        throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
      }

      await courseAccess.assertCanParticipateInCourse(
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
          .select("course_id")
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

        // A private post is visible to its author only, so mentioning
        // someone in it must not notify them (notes already work this way).
        // Without the guard a private thread was an invisible, unmoderated
        // way to send email to other users.
        if (visibility !== "private") {
          await syncMentionsAndNotify(trx, outbox, {
            sourceType: "thread",
            sourceId: id,
            actorUserId: input.userId,
            content: input.content,
            courseId: input.courseId,
            threadId: id,
            plainText,
          });
        }

        // Attach the caller's own ready, still-unattached uploads in one
        // statement. An id that does not qualify is left as it is.
        if (input.attachmentIds && input.attachmentIds.length > 0) {
          await trx
            .updateTable("learning_attachments")
            .set({
              target_type: "thread",
              target_id: id,
            })
            .where("id", "in", input.attachmentIds)
            .where("owner_id", "=", input.userId)
            .where("status", "=", "ready")
            .where("target_id", "is", null)
            .execute();
        }

        const created = await threadsRepo.findThreadById(trx, id);
        if (!created) {
          throw httpError(
            500,
            "CREATE_FAILED",
            "Failed to load created thread",
          );
        }

        const attachments = await listReadyAttachments(trx, "thread", [id]);

        return mapThreadRow(created, input.userId, attachments.get(id));
      });
    },

    async getThread(db, threadId, actor) {
      const row = await threadsRepo.findThreadById(db, threadId);
      if (!row) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      const lessonReadAccess = row.lessonId
        ? await lessonAccess.assertCanReadLesson(db, {
            courseId: row.courseId,
            lessonId: row.lessonId,
            actor,
          })
        : null;
      if (lessonReadAccess?.canReadPrivateState) {
        // The lesson check has already established course access.
        courseAccess.assertThreadVisibleToMember(
          actor!,
          row,
          lessonReadAccess.canModerate,
        );
      } else if (lessonReadAccess) {
        courseAccess.assertThreadIsActive(row);
        if (row.visibility !== "public") {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }
      } else {
        if (!actor) {
          throw DiscussionErrors.unauthorized();
        }
        await courseAccess.assertCanAccessThread(db, actor!, row);
      }
      const canReadPrivateState = lessonReadAccess
        ? lessonReadAccess.canReadPrivateState
        : Boolean(actor);

      const viewerUserId = actor && canReadPrivateState ? actor.userId : null;
      const [
        attachments,
        likedThreadIds,
        bookmarkedThreadIds,
        followedThreadIds,
      ] = await Promise.all([
        listReadyAttachments(db, "thread", [threadId]),
        listLikedThreadIds(db, viewerUserId, [threadId]),
        listBookmarkedThreadIds(db, viewerUserId, [threadId]),
        listFollowedThreadIds(db, viewerUserId, [threadId]),
      ]);

      return mapThreadRow(row, actor?.userId, attachments.get(threadId), {
        likedThreadIds,
        bookmarkedThreadIds,
        followedThreadIds,
      });
    },

    async listThreads(db, query) {
      const actor: DiscussionActor = {
        userId: query.currentUserId || "",
        roles: query.roles || [],
      };
      if (query.courseId && !query.skipCourseAccessCheck) {
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
        return { threads: [], nextCursor: null };
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

      const rows = await threadsRepo.listThreads(db, listOptions);
      const { page, hasMore } = takePage(rows, query.limit);

      const threadIds = page.map((row) => row.id);
      const [
        likedThreadIds,
        bookmarkedThreadIds,
        followedThreadIds,
        attachmentsByThreadId,
      ] = await Promise.all([
        listLikedThreadIds(db, query.currentUserId, threadIds),
        listBookmarkedThreadIds(db, query.currentUserId, threadIds),
        listFollowedThreadIds(db, query.currentUserId, threadIds),
        listReadyAttachments(db, "thread", threadIds),
      ]);

      const threads = page.map((row) =>
        mapThreadRow(
          row,
          query.currentUserId,
          attachmentsByThreadId.get(row.id),
          { likedThreadIds, bookmarkedThreadIds, followedThreadIds },
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

      return { threads, nextCursor };
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

        await courseAccess.assertCanParticipateInCourse(
          trx,
          actor,
          row.courseId,
        );
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

        await courseAccess.assertNotSuspended(
          trx,
          actor.userId,
          row.courseId,
          row.kind,
        );

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

        // Same rule as create (and as notes): a private thread carries no
        // mentions. Turning a thread private drops the ones it had.
        const finalVisibility = updates.visibility ?? row.visibility;
        if (finalVisibility === "private") {
          await trx
            .deleteFrom("learning_mentions")
            .where("source_type", "=", "thread")
            .where("source_id", "=", threadId)
            .execute();
        } else if (updates.content) {
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
        return {
          id: updated.id,
          title: updated.title ?? null,
          content: updated.content,
          plainText: updated.plainText,
          timestampSeconds: updated.timestampSeconds ?? null,
          visibility: updated.visibility,
          updatedAt: toIsoString(updated.updatedAt),
        };
      });
    },

    async deleteThread(db, threadId, actor) {
      const row = await threadsRepo.findThreadById(db, threadId);
      if (!row) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      await courseAccess.assertCanParticipateInCourse(db, actor, row.courseId);
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

    async listPublicPopularDiscussions(db, options) {
      const academyId = await resolveAcademyId(db);
      const rows: PublicPopularThreadRow[] =
        await threadsRepo.listPublicPopularThreads(db, {
          academyId,
          limit: options?.limit ?? 20,
          onePerAuthor: options?.onePerAuthor,
        });

      return {
        discussions: rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          // SQL left(…, 500) counts code points; the schema counts UTF-16
          // units, so one emoji in a long post made this public endpoint
          // return 500 for everyone.
          title: row.title === null ? null : clampText(row.title, 255),
          snippet: clampText(row.snippet ?? "", 500),
          author: {
            displayName: clampText(
              row.authorName?.trim() || "Anonymous Learner",
              100,
            ),
            username: row.authorUsername,
            avatarUrl: row.authorAvatarUrl,
            avatarSrcSet: avatarSrcSetFromUrl(row.authorAvatarUrl),
          },
          courseId: row.courseId,
          lessonId: row.lessonId,
          courseTitle: row.courseTitle,
          lessonTitle: row.lessonTitle,
          replyCount: row.replyCount,
          likeCount: row.likeCount,
          updatedAt: toIsoString(row.updatedAt),
        })),
      };
    },

    async getDiscussionsWorkspace(db, query) {
      const actor: DiscussionActor = {
        userId: query.currentUserId || "",
        roles: query.roles || [],
      };
      const tab = query.tab || "q-and-a";
      const isStaff = actor.roles.some((r) =>
        ["admin", "instructor", "creator", "staff"].includes(r.toLowerCase()),
      );
      const isAuthorRestrictedTab =
        tab === "q-and-a" || tab === "comments" || tab === "notes";

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
        // Saved Notes use the canonical Note rule that lets their owner read
        // the Note even if course access has otherwise lapsed. Thread
        // bookmarks still require canonical course access in the repository.
        if (tab !== "saved") {
          await courseAccess.assertCanAccessCourse(db, actor, query.courseId);
        }
      }

      // The staff view (everyone's threads) covers only the courses the
      // actor may moderate: all of them for an admin, the courses they
      // created for anyone else. Asking for a course outside that set drops
      // the actor back to the ordinary learner view.
      const moderatableCourseIds = isStaff
        ? await courseAccess.listModeratableCourseIds(db, actor)
        : [];
      const hasStaffView =
        isStaff &&
        (moderatableCourseIds === "all" ||
          !query.courseId ||
          moderatableCourseIds.includes(query.courseId));
      const effectiveMine =
        isAuthorRestrictedTab && !hasStaffView ? true : query.mine;

      // Notes use the canonical course-access policy for every role.
      const accessibleCourseIds =
        tab === "saved" ||
        tab === "following" ||
        tab === "notes" ||
        tab === "mentions" ||
        !hasStaffView
          ? await courseAccess.listAccessibleCourseIds(db, actor)
          : moderatableCourseIds;

      if (
        accessibleCourseIds !== "all" &&
        accessibleCourseIds.length === 0 &&
        tab !== "saved"
      ) {
        return { items: [], courses: [], nextCursor: null };
      }

      // The course options feed the filter dropdown, which the client fills
      // from the first page; a later page does not repeat them.
      let courses: DiscussionsWorkspaceResponse["courses"] = [];
      if (
        !query.cursor &&
        (accessibleCourseIds === "all" || accessibleCourseIds.length > 0)
      ) {
        let coursesQuery = db
          .selectFrom("courses")
          .select(["id", "title"])
          .where("status", "=", "published")
          .where("deleted_at", "is", null);

        if (accessibleCourseIds !== "all") {
          coursesQuery = coursesQuery.where("id", "in", [
            ...accessibleCourseIds,
          ]);
        }

        courses = await coursesQuery.orderBy("title", "asc").execute();
      }

      const academyId = await resolveAcademyId(db);
      const limit = query.limit || 20;
      const sort =
        tab === "saved"
          ? BOOKMARKS_WORKSPACE_SORT
          : tab === "mentions"
            ? MENTIONS_WORKSPACE_SORT
            : normalizeThreadSort(query.sort);
      const pageCursor = decodeDiscussionCursor(query.cursor);

      if (
        tab === "saved" &&
        pageCursor &&
        pageCursor.sort !== BOOKMARKS_WORKSPACE_SORT
      ) {
        throw httpError(
          400,
          "INVALID_CURSOR",
          "The pagination cursor does not match the Bookmarks sort.",
        );
      }

      if (
        tab === "mentions" &&
        pageCursor?.sort &&
        pageCursor.sort !== MENTIONS_WORKSPACE_SORT
      ) {
        throw httpError(
          400,
          "INVALID_CURSOR",
          "The pagination cursor does not match the Mentions sort.",
        );
      }

      // Tab: Notes
      if (tab === "notes") {
        const noteSort = normalizeNotesWorkspaceSort(query.sort);
        if (pageCursor?.sort && pageCursor.sort !== noteSort) {
          throw httpError(
            400,
            "INVALID_CURSOR",
            "The pagination cursor does not match the requested Note sort.",
          );
        }
        let notesQuery = db
          .selectFrom("learning_notes as n")
          // Active accounts only: a note by a deactivated account stays
          // listed and is presented without an author.
          .leftJoin("users as u", (join) =>
            join.onRef("u.id", "=", "n.user_id").on("u.is_deleted", "=", false),
          )
          .innerJoin("courses as c", "c.id", "n.course_id")
          .innerJoin("course_lessons as l", "l.id", "n.lesson_id")
          .select([
            "n.id",
            "n.user_id as userId",
            "u.display_name as authorName",
            "u.username as authorUsername",
            "u.avatar_data_url as authorAvatarUrl",
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
          ])
          .where("n.academy_id", "=", academyId)
          .where("c.deleted_at", "is", null)
          .whereRef("l.course_id", "=", "n.course_id");

        if (query.courseId) {
          notesQuery = notesQuery.where("n.course_id", "=", query.courseId);
        } else if (accessibleCourseIds !== "all") {
          notesQuery = notesQuery.where("n.course_id", "in", [
            ...accessibleCourseIds,
          ]);
        }

        if (query.lessonId) {
          notesQuery = notesQuery.where("n.lesson_id", "=", query.lessonId);
        }

        if (effectiveMine === true) {
          // `mine=true` is an ownership constraint for every role.
          notesQuery = notesQuery.where("n.user_id", "=", actor.userId);
          if (query.visibility) {
            notesQuery = notesQuery.where(
              "n.visibility",
              "=",
              query.visibility,
            );
          }
        } else if (
          query.visibility === "private" ||
          query.visibility === "unlisted"
        ) {
          // Canonical Note discovery does not list another user's private or
          // unlisted Notes. Preserve that rule for the workspace feed.
          notesQuery = notesQuery
            .where("n.user_id", "=", actor.userId)
            .where("n.visibility", "=", query.visibility);
        } else if (query.visibility === "public") {
          notesQuery = notesQuery.where("n.visibility", "=", "public");
        } else {
          notesQuery = notesQuery.where((eb) =>
            eb.or([
              eb("n.user_id", "=", actor.userId),
              eb("n.visibility", "=", "public"),
            ]),
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
        }

        if (pageCursor) {
          notesQuery = notesQuery.where(
            noteSort === "activity"
              ? updatedAtIdDescSql("n", pageCursor, "learning_notes")
              : createdAtIdDescSql("n", pageCursor, "learning_notes"),
          );
        }

        notesQuery =
          noteSort === "activity"
            ? notesQuery
                .orderBy("n.updated_at", "desc")
                .orderBy("n.id", "desc")
                .limit(limit + 1)
            : notesQuery
                .orderBy("n.created_at", "desc")
                .orderBy("n.id", "desc")
                .limit(limit + 1);

        const noteRows = await notesQuery.execute();
        const { page, hasMore } = takePage(noteRows, limit);

        const noteIds = page.map((n) => n.id);
        const [bookmarkedNoteIds, attachmentSummaryRows] = await Promise.all([
          listBookmarkedNoteIds(db, actor.userId, noteIds),
          attachmentsRepo.listNoteAttachmentSummaries(db, noteIds),
        ]);
        const attachmentSummariesByNoteId = indexAttachmentSummaries(
          attachmentSummaryRows,
        );

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
          visibility: row.visibility,
          author: presentWorkspaceAuthor(row),
          repliesCount: 0,
          likesCount: Number(row.likesCount || 0),
          isBookmarked: bookmarkedNoteIds.has(row.id),
          isFollowing: false,
          isOwn: row.userId === actor.userId,
          attachmentSummary:
            attachmentSummariesByNoteId.get(row.id) ?? emptyAttachmentSummary(),
          createdAt: toIsoString(row.createdAt),
          updatedAt: toIsoString(row.updatedAt),
        }));

        let nextCursor: string | null = null;
        const last = page.at(-1);
        if (hasMore && last) {
          nextCursor = encodeDiscussionCursor({
            id: last.id,
            createdAt: toDate(last.createdAt),
            ...(noteSort === "activity"
              ? { updatedAt: toDate(last.updatedAt) }
              : {}),
            sort: noteSort,
          });
        }

        return {
          items,
          courses,
          nextCursor,
        };
      }

      // Tab: Mentions (one workspace item per exact mention source)
      if (tab === "mentions") {
        const mentionRows = await threadsRepo.listMentionItems(db, {
          academyId,
          currentUserId: actor.userId,
          pageCursor,
          limit,
          ...(accessibleCourseIds !== "all" ? { accessibleCourseIds } : {}),
          ...(query.courseId ? { courseId: query.courseId } : {}),
          ...(query.lessonId ? { lessonId: query.lessonId } : {}),
          ...(query.kind ? { kind: query.kind } : {}),
          ...(query.search ? { search: query.search } : {}),
          ...(query.visibility ? { visibility: query.visibility } : {}),
        });

        const { page, hasMore } = takePage(mentionRows, limit);
        const threadIds = page
          .filter((row) => row.itemType === "thread")
          .map((row) => row.sourceId);
        const replyIds = page
          .filter((row) => row.itemType === "reply")
          .map((row) => row.sourceId);
        const noteIds = page
          .filter((row) => row.itemType === "note")
          .map((row) => row.sourceId);

        const [
          bookmarkedThreadIds,
          bookmarkedNoteIds,
          followedThreadIds,
          replyCounts,
          threadAttachmentRows,
          replyAttachmentRows,
          noteAttachmentRows,
        ] = await Promise.all([
          listBookmarkedThreadIds(db, actor.userId, threadIds),
          listBookmarkedNoteIds(db, actor.userId, noteIds),
          listFollowedThreadIds(db, actor.userId, threadIds),
          replyIds.length > 0
            ? db
                .selectFrom("learning_replies")
                .select("parent_reply_id")
                .select(sql<number>`count(*)::int`.as("count"))
                .where("parent_reply_id", "in", replyIds)
                .where("status", "=", "active")
                .groupBy("parent_reply_id")
                .execute()
            : Promise.resolve([]),
          attachmentsRepo.listThreadAttachmentSummaries(db, threadIds),
          attachmentsRepo.listReplyAttachmentSummaries(db, replyIds),
          attachmentsRepo.listNoteAttachmentSummaries(db, noteIds),
        ]);

        const replyReplyCounts = new Map(
          replyCounts.flatMap((row) =>
            row.parent_reply_id
              ? [[row.parent_reply_id, Number(row.count)]]
              : [],
          ),
        );
        const threadAttachmentSummaries =
          indexAttachmentSummaries(threadAttachmentRows);
        const replyAttachmentSummaries =
          indexAttachmentSummaries(replyAttachmentRows);
        const noteAttachmentSummaries =
          indexAttachmentSummaries(noteAttachmentRows);

        const items: WorkspaceDiscussionItem[] = page.map((row) => {
          const isThread = row.itemType === "thread";
          const isNote = row.itemType === "note";

          return {
            id: row.sourceId,
            itemType: row.itemType,
            kind: row.kind,
            title: row.title,
            ...(isThread || isNote
              ? {}
              : {
                  parentThreadId: row.parentThreadId,
                  parentThreadTitle: row.parentThreadTitle,
                }),
            content: row.content,
            plainText: row.plainText,
            courseId: row.courseId,
            courseTitle: row.courseTitle,
            lessonId: row.lessonId,
            lessonTitle: row.lessonTitle,
            timestampSeconds: row.timestampSeconds,
            author: presentWorkspaceAuthor(row),
            ...(isThread
              ? {
                  status: threadQaStatus(row),
                  visibility: row.visibility ?? undefined,
                  isLocked: Boolean(row.isLocked),
                  repliesCount: Number(row.repliesCount || 0),
                  likesCount: Number(row.likesCount || 0),
                  isBookmarked: bookmarkedThreadIds.has(row.sourceId),
                  isFollowing: followedThreadIds.has(row.sourceId),
                  attachmentSummary:
                    threadAttachmentSummaries.get(row.sourceId) ??
                    emptyAttachmentSummary(),
                }
              : isNote
                ? {
                    visibility: row.visibility ?? undefined,
                    repliesCount: 0,
                    likesCount: Number(row.likesCount || 0),
                    isBookmarked: bookmarkedNoteIds.has(row.sourceId),
                    attachmentSummary:
                      noteAttachmentSummaries.get(row.sourceId) ??
                      emptyAttachmentSummary(),
                  }
                : {
                    visibility: row.visibility ?? undefined,
                    repliesCount: replyReplyCounts.get(row.sourceId) ?? 0,
                    likesCount: Number(row.likesCount || 0),
                    attachmentSummary:
                      replyAttachmentSummaries.get(row.sourceId) ??
                      emptyAttachmentSummary(),
                  }),
            isOwn: row.userId === actor.userId,
            mentionedAt: toIsoString(row.mentionedAt),
            createdAt: toIsoString(row.createdAt),
            updatedAt: toIsoString(row.updatedAt),
          };
        });

        const last = page.at(-1);
        const nextCursor =
          hasMore && last
            ? encodeDiscussionCursor({
                id: last.mentionId,
                createdAt: toDate(last.mentionedAt),
                sort: MENTIONS_WORKSPACE_SORT,
              })
            : null;

        return {
          items,
          courses,
          nextCursor,
        };
      }

      // Tab: Saved / Bookmarks. The bookmark relationship is the driving
      // dataset so threads and notes share one globally ordered stream.
      if (tab === "saved") {
        const bookmarkRows = await bookmarksRepo.listWorkspaceBookmarks(db, {
          academyId,
          currentUserId: actor.userId,
          accessibleCourseIds,
          courseId: query.courseId,
          lessonId: query.lessonId,
          kind: query.kind,
          search: query.search,
          visibility: query.visibility,
          pageCursor,
          limit,
        });

        const { page, hasMore } = takePage(bookmarkRows, limit);
        const threadIds = page
          .filter((row) => row.itemType === "thread")
          .map((row) => row.id);
        const noteIds = page
          .filter((row) => row.itemType === "note")
          .map((row) => row.id);

        const [followedThreadIds, threadAttachmentRows, noteAttachmentRows] =
          await Promise.all([
            listFollowedThreadIds(db, actor.userId, threadIds),
            attachmentsRepo.listThreadAttachmentSummaries(db, threadIds),
            attachmentsRepo.listNoteAttachmentSummaries(db, noteIds),
          ]);

        const threadAttachmentSummaries =
          indexAttachmentSummaries(threadAttachmentRows);
        const noteAttachmentSummaries =
          indexAttachmentSummaries(noteAttachmentRows);

        const items = page.map((row) =>
          mapBookmarkWorkspaceItem(
            row,
            row.itemType === "thread"
              ? (threadAttachmentSummaries.get(row.id) ??
                  emptyAttachmentSummary())
              : (noteAttachmentSummaries.get(row.id) ??
                  emptyAttachmentSummary()),
            followedThreadIds,
            actor.userId,
          ),
        );

        const last = page.at(-1);
        const nextCursor =
          hasMore && last
            ? encodeDiscussionCursor({
                id: last.bookmarkId,
                createdAt: toDate(last.bookmarkedAt),
                sort: BOOKMARKS_WORKSPACE_SORT,
              })
            : null;

        return {
          items,
          courses,
          nextCursor,
        };
      }

      if (
        (tab === "all" ||
          tab === "q-and-a" ||
          tab === "comments" ||
          tab === "following") &&
        pageCursor?.sort &&
        pageCursor.sort !== sort
      ) {
        throw httpError(
          400,
          "INVALID_CURSOR",
          "The pagination cursor does not match the current sort.",
        );
      }

      // Other tabs: "comments", "q-and-a", "following", "all"
      // Status filtering is only applicable to the "q-and-a" tab. Ownership
      // is controlled by the effective `mine` value; the repository continues
      // to enforce accessible visibility when it is omitted.
      const effectiveStatus = tab === "q-and-a" ? query.status : "all";

      const threadOptions = {
        ...query,
        tab,
        status: effectiveStatus,
        mine: effectiveMine,
        academyId,
        currentUserId: actor.userId,
        pageCursor,
        ...(accessibleCourseIds !== "all" ? { accessibleCourseIds } : {}),
      };

      const threadRows = await threadsRepo.listThreads(db, threadOptions);

      const { page, hasMore } = takePage(threadRows, limit);

      const threadIds = page.map((row) => row.id);
      const [bookmarkedThreadIds, followedThreadIds, attachmentSummaryRows] =
        await Promise.all([
          listBookmarkedThreadIds(db, actor.userId, threadIds),
          listFollowedThreadIds(db, actor.userId, threadIds),
          attachmentsRepo.listThreadAttachmentSummaries(db, threadIds),
        ]);
      const attachmentSummariesByThreadId = indexAttachmentSummaries(
        attachmentSummaryRows,
      );

      const items: WorkspaceDiscussionItem[] = page.map((row) => ({
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
        author: presentWorkspaceAuthor(row),
        status: threadQaStatus(row),
        visibility: row.visibility,
        isLocked: Boolean(row.isLocked),
        repliesCount: Number(row.repliesCount || 0),
        likesCount: Number(row.likesCount || 0),
        isBookmarked: bookmarkedThreadIds.has(row.id),
        isFollowing: followedThreadIds.has(row.id),
        isOwn: row.userId === actor.userId,
        attachmentSummary:
          attachmentSummariesByThreadId.get(row.id) ?? emptyAttachmentSummary(),
        createdAt: toIsoString(row.createdAt),
        updatedAt: toIsoString(row.updatedAt),
      }));

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
      };
    },
  };

  return service;
}
